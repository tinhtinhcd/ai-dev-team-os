# TIN-41: Full Project Code Review

**Date:** 2025-03-09  
**Scope:** AI Dev Team OS — event-driven integration layer (Linear, Slack, Cursor)

---

## Executive Summary

The codebase is well-structured, follows event-driven architecture, and has solid security foundations (signature verification, rate limiting, config masking). Tests pass (100/100), lint and build succeed. Key areas for improvement: input validation consistency, dependency vulnerabilities, auth robustness, and documentation of dual deployment paths (Next.js vs Gateway).

---

## 1. Architecture & Design

### Strengths

- **Clear separation of concerns:** Next.js app (UI, API routes, OAuth) vs Gateway (Express + Bolt for Slack/Linear)
- **Event-driven:** Webhooks and push-based updates only; no polling
- **Dual deployment:** Supports both Next.js API routes and standalone Gateway for flexibility
- **Storage options:** JSON files for thread map/events; SQLite in Gateway for production-ready persistence

### Observations

- **Dual implementation paths:** Slack→Linear (Van Bot) and Linear→Slack flows exist in both Next.js (`/api/slack/events`, `/api/webhooks/linear`) and Gateway (`gateway/src/slack.ts`, `gateway/src/linear-webhook.ts`). This creates maintenance overhead and potential drift. Consider documenting which path is canonical for production.
- **Thread mapping divergence:** Next.js uses `data/linear-thread-map.json`; Gateway uses SQLite `issue_mappings`. Both work but serve different deployment scenarios.

---

## 2. Security

### Strengths

- **Signature verification:** Slack (`verifySlackSignature`) and Linear (`verifyLinearSignature`) use HMAC-SHA256 with `crypto.timingSafeEqual` — timing-attack safe
- **Config masking:** `maskSecret()` in `config.ts` prevents secret leakage in logs
- **Rate limiting:** In-memory sliding-window rate limit on report, Slack events, and Linear webhook routes
- **Report API auth:** Optional `REPORT_API_KEY` with Bearer/X-API-Key support when set
- **Linear webhook:** Signature verification required in production when `LINEAR_WEBHOOK_SECRET` is set

### Issues & Recommendations

| Issue | Severity | Location | Recommendation |
|-------|----------|----------|----------------|
| **Auth env non-null assertions** | Medium | `src/auth.ts` | Uses `process.env.GOOGLE_CLIENT_ID!` and `GOOGLE_CLIENT_SECRET!`. If unset, NextAuth may fail at runtime. Use `optionalEnv` or validate at startup. |
| **Report route: no schema validation** | Low | `src/app/api/report/route.ts` | Body is cast as `Partial<ReportPayload>` without Zod. Malformed input could cause unexpected behavior. Add Zod schema like `series/[seriesId]` route. |
| **Gateway: no rate limiting** | Low | `gateway/src/` | Next.js routes have rate limiting; Gateway does not. Consider adding rate limits for `/linear/webhook` and `/slack/events` in production. |

---

## 3. Input Validation & Error Handling

### Strengths

- **Series API:** Uses Zod for `patchSeriesSchema` with enum validation
- **Linear webhook:** Validates JSON parse; checks `dest.channelId` before posting
- **Report route:** Validates required fields (`issueId`, `state`, `assignee`, `update`, `next`)

### Gaps

- **Report payload:** No max length on `update`/`next`; could allow very large payloads. `truncateUpdate` limits display but not storage/processing.
- **Slack events:** `event.text` is used directly after basic parse; no sanitization for Slack message formatting edge cases.

---

## 4. Code Quality & Consistency

### Strengths

- **TypeScript:** Strict typing throughout; good use of interfaces
- **Shared libs:** `signatures.ts`, `config.ts`, `rate-limit.ts` are reusable and well-tested
- **Tests:** 100 tests across 11 files; good coverage of core logic

### Issues

| Issue | Location | Recommendation |
|-------|----------|-----------------|
| **Comment type mismatch** | `src/lib/linear-webhook.ts` | Gateway handles `Comment` and `IssueComment`; Next.js only `Comment`. Linear may send `IssueComment` for issue comments. Add `IssueComment` for consistency. |
| **Unused eslint-disable** | `scripts/assign-open-issues-to-codex.js` | ESLint reports unused directive. Remove or fix. |
| **Non-null assertion** | `src/app/api/series/[seriesId]/route.ts:94` | `getSeries(seriesId)!` — use explicit null check. |
| **Gateway slack.ts: no task parsing** | `gateway/src/slack.ts` | Gateway uses raw `text.slice(0, 200)` as title; Next.js uses `parseTaskMessage` with `task:`, `context:`, `acceptance:` format. Inconsistent UX when using Gateway vs Next.js. |

---

## 5. Dependencies & Vulnerabilities

### npm audit

```
2 vulnerabilities (1 moderate, 1 high)
- ajv: ReDoS when using $data option (moderate)
- minimatch: ReDoS via repeated wildcards (high)
```

**Recommendation:** Run `npm audit fix` and verify no breaking changes. If fixes are not available, consider `npm audit fix --force` only after testing (may introduce breaking changes).

---

## 6. Configuration & Environment

### Env var clarity

- **SLACK_CHANNEL** — Used by `/api/report` for agent status updates (channel ID or name)
- **SLACK_CHANNEL_ID** — Used by `thread-map.ts` and Linear webhook for default channel when no mapping exists

Both are documented in `.env.example` but the distinction could be clearer in README.

### Gateway startup

- Gateway throws if `SLACK_BOT_TOKEN` or `SLACK_SIGNING_SECRET` are missing (`gateway/src/slack.ts`). Good fail-fast behavior.
- `LINEAR_WEBHOOK_SECRET` is optional; webhook verification is skipped when unset (with console warning).

---

## 7. Testing & CI

### Strengths

- **Vitest:** Fast, 100 tests passing
- **CI:** `ci.yml` runs lint, `tests/run.sh`, build for root and gateway
- **Tooling tests:** `tests/tooling.test.sh` validates scripts, smoke, README

### Gaps

- **Coverage:** `@vitest/coverage-v8` is installed but coverage is not configured or run in CI. Consider adding `coverage` to vitest config and a coverage job.
- **Gateway tests:** `chapters.test.ts` and `chapters-integration.test.ts` exist; `tests/run.sh` runs `tooling.test.sh` but not `npm run test` (Vitest). CI runs `tests/run.sh` which does not run Vitest. The `test.yml` workflow runs `npm run test` separately — so both run in CI via different workflows. Consider consolidating.

---

## 8. Documentation

### Strengths

- **README:** Clear setup, scripts, Van Bot usage, reporting API
- **docs/:** LOCAL_TESTING, SLACK_APP_SETUP, OPEN_TASK_AUTOMATION, WEBHOOK_SETUP
- **archive/ARCHIVE.md:** Documents legacy code rationale

### Recommendations

- Add a "Deployment decision" section: when to use Next.js API routes vs Gateway
- Document `SLACK_CHANNEL` vs `SLACK_CHANNEL_ID` explicitly in README env section

---

## 9. Specific File Notes

### `src/app/api/gateway/health/route.ts`

- Imports `getHealth` from `gateway` package (root `gateway/index.ts`). This returns static `{ status, version }` and does not actually probe the Gateway service. The route name suggests health of the gateway service — consider renaming to `api/health` or documenting that it reports app health, not gateway connectivity.

### `gateway/index.ts` vs `gateway/src/index.ts`

- Root `gateway/index.ts` exports `getHealth` for Next.js health route.
- `gateway/src/index.ts` is the Express app entry. The gateway `package.json` uses `"dev": "tsx watch src/index.ts"` — so the main gateway logic lives in `src/`. The root `gateway/index.ts` is a thin export for the Next.js app. Structure is correct but could be documented.

### `src/lib/thread-map.ts`

- `getSlackDestination` returns `{ channelId: "" }` when no mapping and no `SLACK_CHANNEL_ID`. The webhook route correctly checks `!dest.channelId` before posting. Good defensive handling.

---

## 10. Action Items (Prioritized)

| Priority | Action |
|----------|--------|
| **High** | Run `npm audit fix` and verify build/tests |
| **High** | Add `IssueComment` handling to `src/lib/linear-webhook.ts` for parity with Gateway |
| **Medium** | Add Zod validation to `/api/report` request body |
| **Medium** | Fix auth.ts env handling (avoid non-null assertion) |
| **Medium** | Remove unused eslint-disable in `assign-open-issues-to-codex.js` |
| **Low** | Add rate limiting to Gateway routes |
| **Low** | Replace `getSeries(seriesId)!` with explicit null check |
| **Low** | Document SLACK_CHANNEL vs SLACK_CHANNEL_ID in README |
| **Low** | Consider aligning Gateway Van Bot with Next.js task parsing (`task:`, `context:`, `acceptance:`) |

---

## Conclusion

The project is production-ready with strong security practices and good test coverage. The main improvements are: dependency updates, input validation consistency, auth robustness, and clearer documentation of the dual deployment model. The codebase is maintainable and follows modern TypeScript/Next.js patterns.
