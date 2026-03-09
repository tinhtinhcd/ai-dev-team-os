# AI Dev Team OS

Event-driven AI development team: Linear manages tasks, Cursor executes code, Slack is the reporting hub. All agents report status changes to Slack via the gateway service.

## MVP Goals

- **Gateway** — Central event hub receiving updates from Linear, Cursor, and publishing to Slack
- **Integrations** — Linear (webhooks), Slack (thread-per-issue), Cursor (task assignment)
- **Storage** — Event persistence for audit and replay
- **Event-driven** — No polling; webhooks and push-based updates only

## Setup Guides

- [Phase 1 MVP Task Breakdown](docs/PHASE1_MVP_LINEAR_TASK_BREAKDOWN.md) — Linear task breakdown (TIN-17), execution order, @Leo review
- [Slack App Setup](docs/SLACK_APP_SETUP.md) — Scopes, events, thread-only replies, target channel `#team-leo`
- [Linear Webhook Setup](integrations/linear/WEBHOOK_SETUP.md) — Webhook config and thread mapping
- [Open Tickets](docs/OPEN_TICKETS.md) — Current backlog from Linear (sync with `npm run sync:open-tickets`)
- [Open Issues Task Breakdown](docs/OPEN_ISSUES_TASK_BREAKDOWN.md) — Task breakdowns for open issues, assigned to Codex
- [Open Task → Linear](docs/OPEN_TASK_AUTOMATION.md) — Automation: thêm file .md vào `open-task/` → tạo issue Linear

## How to Run Locally

### Prerequisites

- **Node.js** 18.x or later
- **npm** 9+

### Quick Start

```bash
npm ci
npm run dev
```

Use `npm ci` for reproducible installs (requires `package-lock.json`). Open [http://localhost:3000](http://localhost:3000). The gateway health check is at [http://localhost:3000/api/gateway/health](http://localhost:3000/api/gateway/health). See [Local Testing Guide](docs/LOCAL_TESTING.md) for verification steps.

### Development Validation Checklist

Before merging local setup changes, verify:

- [ ] **Clean install** — `npm ci` completes without errors
- [ ] **Lint & build** — `npm run lint` and `npm run build` pass
- [ ] **Smoke test** — Dev server starts, health check responds
- [ ] **Docs updated** — README and setup guides reflect any changes

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run dev:webpack` | Start dev server (Webpack) |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run sync:open-tickets` | Sync open tickets from Linear to docs/OPEN_TICKETS.md |
| `npm run assign:open-issues-to-codex` | Assign all open issues to Codex (requires LINEAR_CODEX_USER_ID) |
| `npm run process:open-task` | Process .md files in open-task/ → create Linear issues (local test) |

## Project Structure

```
├── gateway/           # Central event hub (health, routing)
├── integrations/     # Adapters for Linear, Slack, Cursor
│   ├── linear/
│   ├── slack/
│   └── cursor/
├── storage/           # Event persistence
├── scripts/           # Sync and automation scripts
├── data/              # Local data and mappings
├── open-task/         # .md files → Linear issues (GitHub Action)
├── archive/           # Legacy code (see archive/ARCHIVE.md)
├── .github/           # GitHub Actions (open-task automation)
├── docs/              # Setup guides and documentation
├── src/
│   ├── app/           # Next.js App Router
│   │   ├── api/       # API routes (gateway health, etc.)
│   │   └── page.tsx   # Gateway landing
│   └── lib/           # Shared utilities
└── public/            # Static assets
```

## Operating Principles

1. **Linear** — Single source of truth for tasks and state
2. **Cursor** — Main coding worker; assigned implementation issues
3. **Slack** — Reporting interface for humans; one thread per Linear issue
4. **Event-driven** — No polling loops; webhooks and push only
5. **Structured reports** — All progress reports short and structured

### Slack → Linear (Van Bot)

Mention **@Van Bot** in Slack with:

```
task: <title>
context: <optional>
acceptance: <optional>
```

The system will:

- Create a Linear issue
- Link the Slack thread in the issue description
- Assign to Cursor by default (if `LINEAR_CURSOR_USER_ID` is set)
- Post confirmation in the Slack thread with the Linear link

**Setup:**

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Enable **Event Subscriptions** and set Request URL to `https://your-domain.com/api/slack/events`
3. Subscribe to **app_mention** under Bot Events
4. Install the app to your workspace and copy the Bot Token
5. Add env vars (see `.env.example`): `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `LINEAR_API_KEY`, `LINEAR_TEAM_ID`, `LINEAR_CURSOR_USER_ID` (optional)

### Slack Reporting (TIN-11)

Agents report status changes to Slack via the gateway API. Format:

```
[ISSUE-ID] Status: <state>
Owner: <assignee>
Update: <1–2 lines>
Next: <next step>
```

**Rules:** Same thread per issue, no duplicates, 3s debounce, no flooding.

**API:**

```bash
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d '{"issueId":"TIN-30","state":"In Progress","assignee":"Cursor","update":"Implemented format and anti-spam","next":"Test in Slack"}'
```

Set `SLACK_BOT_TOKEN` and `SLACK_CHANNEL` in `.env` (see `.env.example`).

## Tech Stack

- **Next.js** 16 (App Router)
- **React** 19
- **Tailwind CSS** 4
- **TypeScript** 5

## Gateway Service (`/gateway`)

Standalone event-driven gateway connecting Slack, Linear, and Cursor. See [gateway/README.md](gateway/README.md) for setup.

- **Slack** — Receives mentions, creates Linear issues, posts updates to threads
- **Linear** — Webhooks post issue updates back to the correct Slack thread
- **SQLite** — Stores `linearIssueId ↔ slackChannelId ↔ slackThreadTs` mapping

```bash
cd gateway && npm install && npm run dev
```

## Legacy Code

Legacy modules (Brain Panel, Linear import, observability, handoff) were moved to `archive/` during TIN-12 cleanup. See [archive/ARCHIVE.md](archive/ARCHIVE.md) for details.
