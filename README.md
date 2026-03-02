# AI Dev Team OS

Event-driven AI development team: Linear manages tasks, Cursor executes code, Slack is the reporting hub. All agents report status changes to Slack via the gateway service.

## MVP Goals

- **Gateway** — Central event hub receiving updates from Linear, Cursor, and publishing to Slack
- **Integrations** — Linear (webhooks), Slack (thread-per-issue), Cursor (task assignment)
- **Storage** — Event persistence for audit and replay
- **Event-driven** — No polling; webhooks and push-based updates only

## How to Run Locally

### Prerequisites

- **Node.js** 18.x or later
- **npm** 9+

### Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The gateway health check is at [http://localhost:3000/api/gateway/health](http://localhost:3000/api/gateway/health).

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run dev:webpack` | Start dev server (Webpack) |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## Project Structure

```
├── gateway/           # Central event hub (health, routing)
├── integrations/     # Adapters for Linear, Slack, Cursor
│   ├── linear/
│   ├── slack/
│   └── cursor/
├── storage/           # Event persistence
├── archive/           # Legacy code (see archive/ARCHIVE.md)
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

## Tech Stack

- **Next.js** 16 (App Router)
- **React** 19
- **Tailwind CSS** 4
- **TypeScript** 5

## Legacy Code

Legacy modules (Brain Panel, Linear import, observability, handoff) were moved to `archive/` during TIN-12 cleanup. See [archive/ARCHIVE.md](archive/ARCHIVE.md) for details.
