# Linear Webhook Integration

## Overview

Linear sends webhook events to the gateway. The gateway parses events and posts structured Slack reports in the mapped thread for each Linear issue.

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
```

### 2. Linear Webhook Configuration

1. Create a webhook in Linear: **Settings → API → Webhooks**
2. URL: `https://your-domain.com/api/webhooks/linear`
3. Select resource types: **Issues**, **Issue comments**, **Issue attachments**
4. Copy the webhook secret into `LINEAR_WEBHOOK_SECRET`

### 3. Thread Mapping

Create `data/linear-thread-map.json` (or set `LINEAR_THREAD_MAP_PATH`):

```json
{
  "TIN-1": {
    "channelId": "C0ABQLYUE0K",
    "threadTs": "1772317278.962769"
  },
  "TIN-13": {
    "channelId": "C0ABQLYUE0K",
    "threadTs": "1772317278.962769"
  }
}
```

- `channelId`: Slack channel ID
- `threadTs`: Parent message timestamp (e.g. from Slack thread URL)

### 4. Slack App

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps)
2. Add `chat:write` scope
3. Install to workspace
4. Copy the Bot User OAuth Token to `SLACK_BOT_TOKEN`

## Webhook Endpoint

- **POST** `/api/webhooks/linear`
- Returns `200` with `{ received: true }` on success
- Returns `401` if signature verification fails (when `LINEAR_WEBHOOK_SECRET` is set)

## Local Development

For local testing, use a tunnel (e.g. [ngrok](https://ngrok.com)):

```bash
ngrok http 3000
# Use https://xxx.ngrok.io/api/webhooks/linear as Linear webhook URL
```

Without `LINEAR_WEBHOOK_SECRET`, signature verification is skipped (useful for local testing).
