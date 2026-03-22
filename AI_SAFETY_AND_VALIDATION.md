# AI Safety and Validation

## 1. Purpose of This Document

This document explains how the system constrains, validates, and observes AI-adjacent behavior in production-facing workflows.

In any system that accepts human input, delegates work to AI-assisted tooling, and turns the result into downstream actions, safety and validation are not optional. The main failure modes are predictable:

- hallucinated or low-quality outputs that look plausible but are wrong
- malformed outputs that break downstream systems
- overly open-ended prompts that produce inconsistent behavior
- repeated or duplicated actions caused by retries, loops, or bot self-events
- corrupted state when unvalidated AI-generated content is persisted or routed

The current repository is primarily an orchestration and integration layer. Its active code paths do not yet contain a first-party model client in `src/` or `gateway/`. Instead, the codebase receives structured inputs from humans and agents, validates them, routes them to external systems such as Slack and Linear, and records events for audit and replay. That still creates an AI safety problem: once an agent or model can influence task creation, reporting, or state transitions, the integration layer must treat those inputs as untrusted and validate them before side effects occur.

## 2. AI Interaction Model

### Current scope

In the active codebase, AI interaction happens indirectly through agent-facing interfaces rather than through a direct language model SDK call:

- humans or agents submit structured task requests through Slack events handled by `src/app/api/slack/events/route.ts`
- agents submit structured status updates through `src/app/api/report/route.ts`
- downstream tool events arrive through `src/app/api/webhooks/linear/route.ts`
- the system persists event records and thread mappings before or after delivery through `src/lib/event-storage.ts` and `src/lib/thread-map.ts`

That means the system already has three distinct trust boundaries:

1. inbound human or agent input
2. normalization and orchestration logic
3. outbound side effects to Slack or Linear

### Where prompts are effectively generated

The repository does not currently build free-form prompts for a model provider. Instead, it generates constrained task descriptions and status messages:

- `src/lib/slack-task.ts` parses Slack mentions into fixed fields: `task`, `context`, and `acceptance`
- `buildLinearDescription()` converts those fields into a structured Linear issue body
- `src/lib/slack-reporting.ts` renders status updates through a fixed template rather than arbitrary free-form text

This is a useful safety property. The system already prefers structured task envelopes over conversational prompting.

### Where responses are received and processed

Responses or outputs are received in two practical forms:

- structured agent reports sent to `/api/report`
- tool-originated events such as Linear webhooks sent to `/api/webhooks/linear`

Those responses are processed only after signature checks, parsing, required-field validation, routing checks, and duplicate suppression.

## 3. Input Validation

The system validates inputs at the edge before performing external side effects.

### Request authenticity

Webhook and event authenticity is verified before parsing or routing:

- Slack events use HMAC validation in `src/lib/signatures.ts` via `verifySlackSignature()`
- Linear webhooks use HMAC validation in the same module via `verifyLinearSignature()`
- the configuration layer in `src/lib/config.ts` defines when signature verification is required

This prevents unauthenticated callers from injecting synthetic events into the orchestration flow.

### Rate limiting

API entry points use `src/lib/rate-limit.ts` to limit burst traffic and reduce abuse:

- `/api/slack/events`
- `/api/webhooks/linear`
- `/api/report`

This is a reliability and safety control. It reduces the blast radius of accidental loops, aggressive clients, and event storms.

### Structured parsing instead of free-form interpretation

Slack task creation does not accept arbitrary prose as a command language. `parseTaskMessage()` in `src/lib/slack-task.ts` expects a constrained shape:

```text
task: <title>
context: <optional>
acceptance: <optional>
```

If parsing fails, the system does not guess. It responds with usage guidance and stops processing. That is a fail-closed behavior, and it is safer than trying to infer intent from ambiguous text.

### Schema validation

The repository already uses Zod in `src/app/api/series/[seriesId]/route.ts` for structured request validation. That route is a good example of the preferred validation pattern:

- parse raw JSON
- validate against an explicit schema
- return a structured validation error
- reject invalid writes

For AI-facing paths, the same approach should be treated as the standard. Today, `/api/report` still uses manual field presence checks rather than Zod. That is acceptable for a narrow payload, but it is weaker than a typed schema because it does not enforce field length, format, or tighter constraints.

### Preventing invalid or harmful inputs

The current code prevents several important classes of bad input:

- malformed JSON returns `400`
- invalid signatures return `401`
- missing configuration returns `500` or `503` depending on the route
- unsupported event types are acknowledged and ignored
- bot-originated or self-originated Slack events are ignored to prevent loops

What it does not yet do is semantic content filtering. There is no active moderation step in the repository today, so harmful-but-well-formed text is not fully screened at the application layer.

## 4. Prompt Design Strategy

Even without a direct model call in the active code path, the system already applies prompt-design discipline at the integration boundary.

### Constrain the shape of work

Inputs are split into named fields rather than treated as unconstrained conversation. That has three advantages:

- it reduces ambiguity
- it forces the caller to distinguish task intent from supporting context
- it gives downstream systems stable fields to validate and store

### Use templates for outputs

`src/lib/slack-reporting.ts` formats agent reports through `DEFAULT_REPORT_TEMPLATE`:

```text
[{{issueId}}] Status: {{state}} Owner: {{assignee}} Update: {{update}} Next: {{next}}
```

This is effectively a structured prompt-and-response contract. It keeps the output narrow enough that downstream systems can reason about it.

### Avoid open-ended prompts in automated paths

The safest automation paths in this repository are intentionally narrow:

- task creation accepts fixed fields
- report submission accepts fixed fields
- Linear webhook handling only formats supported event types

That design avoids giving an AI or agent an unrestricted place to invent new commands, mutate arbitrary records, or emit unbounded text into a control path.

## 5. Output Validation

Output validation is where the system prevents AI-assisted behavior from becoming incorrect side effects.

### Structured output checks

For agent reports, `/api/report` requires:

- `issueId`
- `state`
- `assignee`
- `update`
- `next`

If any field is missing, the route returns `400` and does not send anything to Slack.

### Output normalization

`truncateUpdate()` in `src/lib/slack-reporting.ts` limits the `update` field to at most two non-empty lines. This is not a full semantic validator, but it is an important guardrail:

- it keeps outputs readable
- it limits spam and accidental prompt dumps
- it makes repeated reports easier to compare and deduplicate

### Output routing checks

Before a downstream action is taken, the system checks routing prerequisites:

- Linear webhook events are formatted only when the event type is recognized
- Slack delivery only proceeds if a channel or thread mapping exists
- `/api/report` only posts when Slack credentials and channel configuration are present

If those conditions are not met, the system skips or fails the event instead of guessing a destination.

### Current limitation

There is no first-class structured output validator for direct model responses because the active codebase does not yet call a model provider directly. When that boundary is added, the response must be parsed against an explicit schema before any persistence or external API call is allowed.

## 6. Handling Unpredictable Outputs

Production systems should assume that AI or agent-originated outputs will sometimes be incomplete, malformed, duplicated, or operationally unsafe.

### Incomplete output

If required fields are missing in `/api/report`, the system rejects the request with `400`. It does not attempt to infer missing values.

### Malformed output

If JSON parsing fails on webhook or event routes, the request is rejected with `400`.

### Unsupported output shape

If a Linear webhook does not correspond to a supported formatter, `formatLinearEventForSlack()` returns `null`, the event is marked as `skipped`, and no Slack message is sent.

### Duplicate output

`src/lib/slack-reporting.ts` implements duplicate suppression and a short debounce window:

- same issue, same payload hash, within 3 seconds -> skip
- rapid repeated updates for the same issue -> coalesce

This is important when agent frameworks retry aggressively or produce several status updates in quick succession.

### Retry and fallback behavior

The codebase currently supports replay better than automatic retry:

- failed or skipped Linear events are persisted in `src/lib/event-storage.ts`
- `src/app/api/webhooks/linear/replay/route.ts` can replay stored events later

This is a good recovery mechanism, but it is not yet a comprehensive retry policy. There is no centralized exponential backoff layer for external calls in the Next.js routes today.

## 7. Error Handling

### API failures

External API failures are surfaced and handled explicitly:

- Slack and Linear API helpers return structured success or error results
- routes convert those failures into stable HTTP responses
- in user-facing Slack flows, the system often reports the failure back into the originating thread instead of silently dropping it

That makes failures visible without corrupting internal state.

### Partial responses

The current routes assume complete JSON request bodies and complete API responses. They do not process token streams or partial model outputs. This simplifies correctness, but it means future streaming model integrations will need additional buffering and validation logic.

### Timeouts

The active codebase does not yet wrap outbound fetches in explicit timeout controls. That is an operational gap:

- hung upstream requests can consume route execution time
- timeout policy is currently delegated to the runtime or upstream network stack

For production model-serving paths, explicit request deadlines should be mandatory.

### Graceful degradation

The system already degrades gracefully in several places:

- parse failures produce guidance instead of side effects
- missing configuration produces stable error responses
- unsupported events are ignored rather than misrouted
- replay endpoints allow operators to recover after a downstream outage

## 8. Safety Constraints

The current repository enforces safety mostly through structural constraints rather than content moderation.

### Existing constraints

- signature verification on inbound webhooks
- rate limiting on ingress routes
- optional API key protection for `/api/report`
- duplicate suppression and debounce for repeated reports
- bot self-event rejection to prevent loops
- secret masking in configuration helpers
- thread-scoped Slack posting to avoid noisy top-level channel spam

### Output sanitization

Sanitization is limited today. The system truncates update text, strips Slack mention markup during task parsing, and avoids posting unsupported payloads, but it does not apply full content filtering or model moderation.

That means the platform is protected against malformed control flow more than it is protected against harmful natural-language content. If direct LLM output becomes user-visible or persisted at larger scale, moderation and redaction should be added explicitly.

## 9. Data Integrity

The safety model is tied closely to how data is persisted.

### Valid writes only

The repository tries to write only after basic structural checks:

- thread mappings are stored only after a successful Linear issue creation
- event status is updated as processing progresses
- invalid payloads are rejected before persistence when possible

### Audit and replay support

`src/lib/event-storage.ts` stores raw webhook payloads with:

- a generated event ID
- webhook metadata
- processing status
- issue identifiers
- failure reason when available

That makes reconciliation possible without reconstructing the original event from logs.

### Preventing corruption from AI-generated content

The main integrity strategy today is containment:

- keep AI-influenced inputs in narrow fields
- validate before external side effects
- persist raw events separately from derived routing state
- use deterministic mappings rather than inferred destinations

This is a practical approach for an orchestration layer. It reduces the chance that one malformed output silently corrupts unrelated state.

## 10. Observability

Observability is necessary because AI-adjacent failures rarely present as simple crashes. They often appear as wrong routing, duplicate actions, missing notifications, or inconsistent formatting.

### What is observable today

- persisted Linear webhook event log in `src/lib/event-storage.ts`
- replay and inspection endpoints in `src/app/api/webhooks/linear/replay/route.ts`
- report state machine states in `src/lib/slack-reporting.ts` such as `pending`, `sending`, `sent`, `duplicate`, and `error`
- configuration helpers that avoid leaking raw secrets in logs
- route-level tests covering malformed input, duplicate suppression, missing config, and signature failures

### What observability is still missing

- request tracing across Slack -> app -> Linear -> Slack
- metrics for validation failures, duplicate suppression rate, and replay volume
- latency histograms for external API calls
- explicit correlation IDs across inbound and outbound events

Without those additions, debugging remains possible, but still too manual for higher event volume.

## 11. Trade-offs

### Strict validation vs flexibility

Strict validation prevents bad writes and unsafe automation, but it also makes the system less forgiving of loosely formatted human or agent input. This repository mostly chooses strictness for control-plane actions, which is the right default.

### Cost vs reliability

Retries, replay, richer persistence, and stronger schema validation all improve reliability, but they add storage, operational overhead, and in direct model-serving paths, extra token cost. The current codebase leans toward simpler control flow with manual replay rather than aggressive automated retry.

### Latency vs safety checks

Signature verification, schema validation, dedupe checks, and persistence add latency to each request. For workflow orchestration this is usually an acceptable trade. The alternative is faster but less predictable automation.

### Simplicity vs future model integration

The current repository is simpler because it does not yet stream or parse first-party model outputs. That reduces risk today, but once direct LLM invocation is added, the system will need a stricter validation layer than the current manual field checks used in some routes.

## 12. Future Improvements

The next hardening steps are straightforward and concrete:

- add Zod schemas to all AI-facing and agent-facing routes, especially `/api/report`
- introduce explicit output schemas for any future direct model response
- add request deadlines and retry policies with bounded backoff for Slack, Linear, and future model providers
- attach correlation IDs to inbound events, downstream API calls, and stored event records
- add metrics for validation failures, replay frequency, duplicate suppression, and downstream delivery failures
- implement moderation or redaction for any future user-visible model output
- define semantic validation rules beyond shape validation, for example length limits, allowed states, and identifier formats
- add automated replay tooling that can safely re-run only idempotent events

## 13. Summary

The current system is safest where it is most constrained: inbound signatures are verified, task requests use narrow structured fields, duplicate reports are suppressed, unsupported events are ignored, and event history is persisted for replay.

The main limitation is also clear: the repository currently demonstrates strong control-plane validation around AI-assisted workflows, but not a full direct model-serving safety layer. When direct LLM calls are introduced, the same engineering principles already visible in this codebase should be extended one step further:

- validate input before the model call
- constrain prompts to explicit schemas
- validate output before any side effect
- persist enough metadata to debug and replay failures
- fail closed when the output is ambiguous
