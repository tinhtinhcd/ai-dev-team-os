# Local Testing Guide

How to run the AI Dev Team OS app locally and verify it works.

## Prerequisites

- **Node.js** 18.x or later
- **npm** 9+

## Quick Start

```bash
npm install
npm run dev
```

The app starts at [http://localhost:3000](http://localhost:3000).

## Verification Checklist

### 1. Main Page

```bash
curl -s http://localhost:3000 | grep -o "AI Dev Team OS"
```

**Expected:** `AI Dev Team OS` appears in the HTML.

### 2. Gateway Health Check

```bash
curl -s http://localhost:3000/api/gateway/health
```

**Expected:** `{"status":"ok","version":"0.1.0"}`

### 3. Report API (Slack optional)

```bash
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d '{"issueId":"TIN-30","state":"In Progress","assignee":"Cursor","update":"Testing locally","next":"Verify"}'
```

**Expected (no Slack config):** `{"success":false,"error":"Slack not configured. Set SLACK_BOT_TOKEN and SLACK_CHANNEL."}`

**Expected (with Slack config):** `{"success":true,"message":"Report posted to Slack"}`

### 4. Slack Events API (Van Bot)

```bash
curl -s -X POST http://localhost:3000/api/slack/events \
  -H "Content-Type: application/json" \
  -d '{"type":"url_verification","challenge":"test"}'
```

**Expected (no Slack config):** `{"error":"Slack not configured"}` — endpoint is reachable and validates config before processing.

**Expected (with SLACK_SIGNING_SECRET):** With valid signature, returns `{"challenge":"test"}` for URL verification. Use ngrok + Slack Event Subscriptions for full flow.

### 5. Lint

```bash
npm run lint
```

**Expected:** No errors.

## Optional: Gateway Service

For full Slack ↔ Linear integration, run the standalone gateway:

```bash
cd gateway && npm install && npm run dev
```

See [gateway/README.md](../gateway/README.md) for setup.

## Environment

Copy `.env.example` to `.env` for Slack/Linear integrations. The app runs without env vars; integrations return clear errors when not configured.
