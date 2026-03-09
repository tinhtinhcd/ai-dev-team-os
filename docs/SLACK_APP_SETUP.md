# Slack App Setup Checklist

Setup guide for the AI Dev Team OS Slack bot. The bot responds to mentions, creates Linear issues, and posts updates **only in threads** (never in the main channel).

**Target channel for MVP:** `#team-leo`

---

## Required Scopes

Under **OAuth & Permissions** → **Scopes** → **Bot Token Scopes**, add:

| Scope | Purpose |
|-------|---------|
| `chat:write` | Post messages to channels and threads |
| `app_mentions:read` | Receive `app_mention` events when the bot is @mentioned |
| `channels:read` | List public channels (for channel lookup) |

---

## Event Subscription

1. Go to **Event Subscriptions** and turn **Enable Events** ON.
2. Set **Request URL** to your Events API endpoint:
   - **Next.js app:** `https://your-domain.com/api/slack/events`
   - **Gateway service:** `https://your-host/slack/events`
3. Under **Subscribe to bot events**, add:
   - `app_mention` — fires when someone @mentions the bot

Slack will send a verification challenge; your server must respond with the `challenge` value.

---

## Reply Behavior: Thread Only

The bot **must reply only in threads**. All responses use `thread_ts` so they appear as thread replies, not top-level messages.

Example `chat.postMessage` payload:

```json
{
  "channel": "C0ABQLYUE0K",
  "thread_ts": "1772317278.962769",
  "text": "Created Linear issue: TIN-8 — https://linear.app/issue/TIN-8"
}
```

- `thread_ts` = parent message timestamp (from the mention event)
- If the mention is already in a thread, use `event.thread_ts`; otherwise use `event.ts` as the root

---

## Setup Steps

### 1. Create the Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** → **From scratch**
3. Name the app (e.g. "Van Bot") and select your workspace

### 2. Add OAuth Scopes

1. **OAuth & Permissions** → **Scopes** → **Bot Token Scopes**
2. Add: `chat:write`, `app_mentions:read`, `channels:read`

### 3. Enable Event Subscriptions

1. **Event Subscriptions** → **Enable Events** ON
2. **Request URL:** `https://your-domain.com/api/slack/events` (or gateway URL)
3. **Subscribe to bot events:** add `app_mention`
4. Save changes (Slack verifies the URL)

### 4. Install to Workspace

1. **Install App** → **Install to Workspace**
2. Authorize the requested scopes
3. Copy **Bot User OAuth Token** (`xoxb-...`)
4. Copy **Signing Secret** from **Basic Information** → **App Credentials**

### 5. Invite Bot to Channel

1. In Slack, open `#team-leo` (or your target channel)
2. Type `/invite @Van Bot` (or your app name)
3. The bot must be in the channel to receive mentions and post replies

### 6. Environment Variables

Add to `.env` (see `.env.example`):

```bash
SLACK_SIGNING_SECRET=...   # From Basic Information → App Credentials
SLACK_BOT_TOKEN=xoxb-...  # Bot User OAuth Token
```

For Linear integration (Van Bot flow):

```bash
LINEAR_API_KEY=...
LINEAR_TEAM_ID=...
LINEAR_CURSOR_USER_ID=...  # Optional: default assignee
```

For agent status reporting (TIN-11, `/api/report`):

```bash
SLACK_CHANNEL=...  # Channel ID for reports (e.g. C0ABQLYUE0K or #team-leo)
```

---

## Verification

### Acceptance Criteria

- [ ] **Slack bot can be installed** — App installs to workspace without errors
- [ ] **Can respond to mention** — @mention the bot in `#team-leo` and receive a reply
- [ ] **Posts into thread only** — All bot replies appear as thread replies, not in the main channel

### Quick Test

1. In `#team-leo`, type: `@Van Bot task: Test setup`
2. Bot should reply in the **thread** with a Linear issue link or an error message
3. Confirm no bot messages appear as top-level channel messages

---

## Copy-Paste Checklist

```
[ ] Create Slack app at api.slack.com/apps
[ ] Add scopes: chat:write, app_mentions:read, channels:read
[ ] Enable Event Subscriptions
[ ] Set Request URL (api/slack/events or /slack/events)
[ ] Subscribe to app_mention
[ ] Install app to workspace
[ ] Copy Bot Token and Signing Secret to .env
[ ] Invite bot to #team-leo
[ ] Test: @mention bot and verify thread-only reply
```

---

## Local Development

Use a tunnel (e.g. [ngrok](https://ngrok.com)) so Slack can reach your local server:

```bash
ngrok http 3000
# Use https://xxx.ngrok.io/api/slack/events as Request URL
```

Update the Request URL in Slack Event Subscriptions when the ngrok URL changes.
