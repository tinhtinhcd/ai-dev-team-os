import express from "express";
import { receiver, slackApp } from "./slack.js";
import { createLinearWebhookRouter } from "./linear-webhook.js";

// Mount Linear webhook FIRST so it gets raw body (no json parser before it)
receiver.app.use(createLinearWebhookRouter());

// Bolt receiver handles /slack/events with built-in Slack signature verification
receiver.app.get("/health", (_req: express.Request, res: express.Response) => {
  res.json({ status: "ok", service: "gateway" });
});

const port = Number(process.env.PORT) || 3001;

;(async () => {
  await slackApp.start(port);
  console.log(`Gateway listening on http://localhost:${port}`);
  console.log("  /slack/events   — Slack Events API (signature verified by Bolt)");
  console.log("  /linear/webhook — Linear webhooks (signature verified)");
  console.log("  /health         — Health check");
})();
