# Linear Webhook Integration

## Overview

Linear sends webhook events to your endpoint. The app parses events and posts structured Slack reports in the mapped thread for each Linear issue.

**Two deployment options:**

| Deployment | Webhook URL | Thread mapping |
|------------|-------------|----------------|
| **Next.js app** | `https://your-domain.com/api/webhooks/linear` | JSON file (`LINEAR_THREAD_MAP_PATH`) |
| **Standalone gateway** | `https://your-host/linear/webhook` | SQLite (auto-populated when creating issues via Slack mention) |

See [gateway/README.md](../../gateway/README.md) for the standalone gateway setup.

## Events Supported

| Event | Linear Type | Action |
|-------|-------------|--------|
| Issue created | Issue | create |
| Issue updated | Issue | update |
| State changed | Issue | update (detected via `updatedFrom.state`) |
| Assignee changed | Issue | update (detected via `updatedFrom.assignee`) |
| Comment created | Comment | create |
| PR link added | IssueAttachment | create |

## Setup

### 1. Environment Variables

```bash
# Required for Slack posting
SLACK_BOT_TOKEN=xoxb-...          # Bot token with chat:write scope

# Required for thread mapping (fallback channel when no mapping exists)
SLACK_CHANNEL_ID=C0ABQLYUE0K     # Default Slack channel

# Required for signature verification (recommended in production)
LINEAR_WEBHOOK_SECRET=...        # Secret from Linear webhook config

# Optional: custom path for thread mapping file
LINEAR_THREAD_MAP_PATH=./data/linear-thread-map.json

# Optional: path for event log (used for replay/reconciliation)
LINEAR_EVENTS_PATH=./data/linear-events.json
```

### 2. Linear Webhook Configuration

1. Create a webhook in Linear: **Settings → API → Webhooks**
2. URL: `https://your-domain.com/api/webhooks/linear` (Next.js) or `https://your-host/linear/webhook` (gateway)
3. Select resource types: **Issues**, **Issue comments**, **Issue attachments**
4. Copy the webhook secret into `LINEAR_WEBHOOK_SECRET`

### 3. Thread Mapping

Create `data/linear-thread-map.json` (or set `LINEAR_THREAD_MAP_PATH`):

```json
{
  "TIN-1": {
    "channelId": "C0ABQLYUE0K",
    "threadTs": "1772317278.962769"
  }
}
```

- `channelId`: Slack channel ID
- `threadTs`: Parent message timestamp (e.g. from Slack thread URL)
- Keys are Linear issue identifiers (e.g. TIN-1, TIN-30). See [docs/OPEN_TICKETS.md](../../docs/OPEN_TICKETS.md) for current issues.
- **Auto-mapping**: When Van Bot creates a Linear issue from an `@mention` in Slack, the mapping is stored automatically.

### 4. Slack App

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Add `chat:write` scope
3. Install to workspace
4. Copy the Bot User OAuth Token to `SLACK_BOT_TOKEN`

## Webhook Endpoint

- **POST** `/api/webhooks/linear`
- Returns `200` with `{ received: true }` or `{ received: true, posted: true }` on success
- Returns `401` if signature verification fails (when `LINEAR_WEBHOOK_SECRET` is set)
- All events are logged persistently for replay and reconciliation.

## Event Replay (Reconciliation)

Failed or skipped events can be replayed:

- **GET** `/api/webhooks/linear/replay` — Query stored events (params: `issueIdentifier`, `status`, `since`, `limit`)
- **POST** `/api/webhooks/linear/replay` — Replay failed/skipped events (params: `issueIdentifier`, `status`, `since`, `limit`)

## Local Development

For local testing, use a tunnel (e.g. [ngrok](https://ngrok.com)):

```bash
ngrok http 3000
# Use https://xxx.ngrok.io/api/webhooks/linear as Linear webhook URL
```

Without `LINEAR_WEBHOOK_SECRET`, signature verification is skipped (useful for local testing).
