# Gateway Service

Event-driven gateway connecting Slack, Linear, and Cursor. Linear is the source of truth; Slack is the reporting hub.

## Tech Stack

- **Node.js** + **Express**
- **Bolt** for Slack (signature verification built-in)
- **Linear SDK** for API + webhook verification
- **SQLite** (better-sqlite3) for issue ↔ thread mapping

## Endpoints

| Path | Purpose |
|------|---------|
| `POST /slack/events` | Slack Events API — receives mentions, verifies Slack signature |
| `POST /linear/webhook` | Linear webhooks — receives issue updates, verifies Linear signature |
| `GET /health` | Health check |

## Setup

1. **Slack App** (https://api.slack.com/apps)
   - Create app → enable Event Subscriptions
   - Subscribe to `app_mention`
   - Request scope: `chat:write`, `app_mentions:read`
   - Install to workspace → copy **Bot Token** and **Signing Secret**

2. **Linear**
   - API key: https://linear.app/settings/api
   - Team ID: from Linear URL or API
   - Webhook: https://linear.app/settings/api → Webhooks → add URL `https://your-host/linear/webhook` → copy **Webhook Secret**

3. **Environment**

```bash
cp .env.example .env
# Edit .env with your values
```

4. **Run**

```bash
cd gateway
npm install
npm run dev
```

## Flow

1. **Slack mention** → Gateway receives event (signature verified by Bolt) → creates Linear issue → stores `linearIssueId ↔ slackChannelId ↔ slackThreadTs` → replies in thread.
2. **Linear webhook** → Gateway receives webhook (signature verified) → looks up mapping → posts update to the correct Slack thread.

## Chapters (TIN-37)

Concurrency-safe chapter numbering per series. The `chapters` table has `UNIQUE(series_id, number)` and `createChapter(seriesId, title?)` retries on conflict to avoid duplicate numbers under concurrent requests.

```ts
import { createChapter } from "./src/db.js";
const ch = createChapter("series-123", "Chapter Title");
// ch.number is the next available number for that series
```

## Acceptance Criteria

- [x] Can receive Slack mention
- [x] Can create Linear issue
- [x] Can receive Linear webhook
- [x] Can post update back to correct Slack thread
