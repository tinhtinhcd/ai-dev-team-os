# Phase 1 MVP — Linear Task Breakdown

> **Issue:** TIN-17 — Break down Phase 1 MVP into Linear tasks  
> **Owner:** @Leo (review/ownership)  
> **Last updated:** 2026-03-06

## 1. Executive Summary

Phase 1 MVP establishes the foundational infrastructure for the AI Dev Team OS: an event-driven system where **Linear** is the source of truth, **Slack** is the reporting hub, and **Cursor** executes code. The gateway service connects these platforms via webhooks and push-based updates only (no polling).

---

## 2. MVP Success Criteria

| Criterion | Definition of Done |
|-----------|--------------------|
| **Core architecture** | Modular gateway with Slack + Linear adapters; signature verification; SQLite for thread mapping |
| **Task routing** | Linear issues created from Slack mentions; updates posted to correct Slack thread |
| **Communication protocols** | Webhook-based (Slack Events API, Linear webhooks); structured report format via `/api/report` |
| **Cross-platform sync** | Linear ↔ Slack thread mapping; automated context transfer (issue updates → Slack thread) |
| **AI-assisted allocation** | Cursor assigned to new issues by default (when `LINEAR_CURSOR_USER_ID` set) |
| **Integrations** | Slack (mentions, reporting), Linear (webhooks, issue creation), GitHub (open-task automation) |
| **Local development** | `npm run dev` works; health check passes; docs for setup and testing |

---

## 3. Technical Specifications

| Component | Technology |
|-----------|------------|
| **Gateway** | Node.js + Express (standalone) or Next.js API routes |
| **Slack** | Bolt (signature verification), Events API, `app_mention` |
| **Linear** | GraphQL API, webhooks (Issues, Comments, Attachments) |
| **Storage** | SQLite (better-sqlite3) for `linearIssueId ↔ slackChannelId ↔ slackThreadTs` |
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| **Env** | `.env` with `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `LINEAR_API_KEY`, `LINEAR_TEAM_ID`, etc. |

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AI Dev Team OS — Phase 1 MVP                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────┐     webhooks      ┌─────────────┐     webhooks    ┌────────┐ │
│   │  Slack   │ ◄────────────────► │   Gateway   │ ◄──────────────►│ Linear │
│   │ (mentions│                    │   Service   │                 │        │ │
│   │ reports) │                    │             │                 └────────┘ │
│   └──────────┘                    │  SQLite     │                        │
│         ▲                         │  (mapping)  │                        │
│         │                         └──────┬─────┘                        │
│         │ /api/report                     │                              │
│         │                         ┌──────▼─────┐                        │
│   ┌────┴────┐                    │   Cursor    │                        │
│   │ Cursor  │ ─── assigns ──────►│  (agent)    │                        │
│   │ (agent) │                    └─────────────┘                        │
│   └─────────┘                                                           │
│                                                                          │
│   GitHub: open-task/*.md → Linear (via Actions) — optional automation     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Task Breakdown — Execution Order

Tasks must be completed in **strict dependency order**. Each task has a **gate to next task** that must be satisfied before proceeding.

### Execution Sequence

```
TIN-23 (Local Dev) ──► TIN-18 (Gateway) ──► TIN-22 (Security/Auth) ──► TIN-19, TIN-20 (parallel) ──► TIN-21
```

---

### TIN-23: Local Development Setup

| Field | Value |
|-------|-------|
| **Depends on** | None |
| **Gate to next** | `npm run dev` runs; health check returns `{"status":"ok"}`; `npm run lint` passes |
| **Review** | @Leo |

**Scope:**
- Node.js 18+, npm 9+ documented
- `npm install`, `npm run dev` working
- Health endpoint: `GET /api/gateway/health`
- `.env.example` with required vars
- `docs/LOCAL_TESTING.md` with verification checklist

**DoD:**
- [ ] All scripts run without error
- [ ] Health check returns 200
- [ ] Lint passes
- [ ] Minimal manual smoke test documented

**Review ticket:** TIN-27 — Review & merge local development setup changes

---

### TIN-18: Gateway Service Core Infrastructure

| Field | Value |
|-------|-------|
| **Depends on** | TIN-23 |
| **Gate to next** | Gateway receives Slack/Linear webhooks; signature verification works; SQLite stores mapping |
| **Review** | @Leo |

**Scope:**
- Modular Express (or Next.js API) server
- Routes: `POST /slack/events`, `POST /linear/webhook`, `GET /health`
- Slack signature verification (Bolt or manual)
- Linear webhook signature verification
- SQLite layer for `linearIssueId ↔ slackChannelId ↔ slackThreadTs`
- Basic logging and error handling

**DoD:**
- [ ] Unit/integration tests for core flows
- [ ] Full test suite passes
- [ ] Manual smoke test: mention bot → issue created → webhook → thread updated

**Review ticket:** TIN-25 — Review & merge Gateway service core changes

---

### TIN-22: Security and Authentication Setup

| Field | Value |
|-------|-------|
| **Depends on** | TIN-18 |
| **Gate to next** | All webhooks verify signatures; no unauthenticated write access |
| **Review** | @Leo |

**Scope:**
- Slack signing secret verification on all Slack endpoints
- Linear webhook secret verification
- Env vars documented; no secrets in code
- Rate limiting / basic hardening (optional for MVP)

**DoD:**
- [ ] Invalid signatures rejected with 401
- [ ] Tests for verification logic
- [ ] `.env.example` updated

**Review ticket:** TIN-28 — Review & merge security/auth setup changes

---

### TIN-19: Slack Bot Event Handling

| Field | Value |
|-------|-------|
| **Depends on** | TIN-22 |
| **Gate to next** | @mention → Linear issue created; thread link in description; confirmation in Slack |
| **Review** | @Leo |

**Scope:**
- Parse `app_mention` events
- Extract `task:`, `context:`, `acceptance:` from message
- Create Linear issue via API
- Store mapping in SQLite
- Reply in thread with Linear link
- Optional: assign to Cursor (`LINEAR_CURSOR_USER_ID`)

**DoD:**
- [ ] Tests for parsing and issue creation
- [ ] Manual test: mention bot → issue appears in Linear
- [ ] Thread-only replies (no channel spam)

**Review ticket:** TIN-24 — Review & merge Slack bot event handling changes

---

### TIN-20: Linear Webhook Event Processing

| Field | Value |
|-------|-------|
| **Depends on** | TIN-22 |
| **Gate to next** | Linear webhook → lookup mapping → post update to correct Slack thread |
| **Review** | @Leo |

**Scope:**
- Receive Linear webhooks (Issue create/update, Comment, Attachment)
- Verify signature
- Lookup `linearIssueId` in SQLite
- Post structured update to Slack thread
- Handle missing mapping gracefully

**DoD:**
- [ ] Tests for webhook parsing and thread lookup
- [ ] Manual test: change issue state in Linear → update in Slack thread

**Review ticket:** TIN-26 — Review & merge Linear webhook processing changes

---

### TIN-21: Automated Slack Reporting System

| Field | Value |
|-------|-------|
| **Depends on** | TIN-19, TIN-20 |
| **Gate to next** | Agents can POST to `/api/report`; format enforced; anti-spam (debounce, same-thread) |
| **Review** | @Leo |

**Scope:**
- `POST /api/report` endpoint
- Format: `[ISSUE-ID] Status: <state>`, `Owner:`, `Update:`, `Next:`
- Same thread per issue; no duplicates; 3s debounce
- Post to Slack channel/thread

**DoD:**
- [ ] Tests for format parsing and anti-spam
- [ ] Manual test: curl `/api/report` → message in Slack
- [ ] Documentation in README

**Review ticket:** TIN-29 — Review & merge automated Slack reporting changes

---

## 6. Review & Merge Workflow

| Implementation Ticket | Review/Merge Ticket | Owner |
|-----------------------|---------------------|-------|
| TIN-23 | TIN-27 | @Leo |
| TIN-18 | TIN-25 | @Leo |
| TIN-22 | TIN-28 | @Leo |
| TIN-19 | TIN-24 | @Leo |
| TIN-20 | TIN-26 | @Leo |
| TIN-21 | TIN-29 | @Leo |

**Standard DoD for all tickets:**
- Add/update tests; full test suite passes
- Minimal manual smoke test completed
- No new lint errors
- Documentation updated
- Peer review by @Leo before merge

---

## 7. Mapping to Phase 1 Requirements

| Phase 1 Item | Covered By |
|--------------|------------|
| Core system architecture: modular agent integration framework | TIN-18 (Gateway), TIN-19, TIN-20 |
| Basic task routing/prioritization | TIN-19 (Slack → Linear), TIN-20 (Linear → Slack) |
| Initial communication protocols | TIN-18, TIN-21 (report format) |
| Cross-platform work item sync | TIN-19, TIN-20 (Linear ↔ Slack) |
| Automated context transfer between tools | TIN-20 (Linear updates → Slack thread) |
| Basic AI-assisted task allocation | TIN-19 (Cursor default assignee) |
| GitHub repo management | Open-task automation (existing); full GitHub integration = Phase 2 |
| Linear/Jira ticket tracking | TIN-19, TIN-20 |
| Slack integration | TIN-19, TIN-21 |
| MVP success criteria, technical specs, architecture | This document |

---

## 8. References

- [README.md](../README.md) — Project overview, setup, flows
- [docs/SLACK_APP_SETUP.md](SLACK_APP_SETUP.md) — Slack app configuration
- [integrations/linear/WEBHOOK_SETUP.md](../integrations/linear/WEBHOOK_SETUP.md) — Linear webhook setup
- [gateway/README.md](../gateway/README.md) — Gateway service
- [docs/LOCAL_TESTING.md](LOCAL_TESTING.md) — Local verification
