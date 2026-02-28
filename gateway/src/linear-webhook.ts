import { LinearWebhookClient } from "@linear/sdk/webhooks";
import express, { Request, Response } from "express";
import { getMappingByLinearId } from "./db.js";
import { postToSlackThread } from "./slack.js";

const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;
if (!webhookSecret) {
  console.warn("LINEAR_WEBHOOK_SECRET not set — Linear webhook signature verification disabled");
}

const webhookClient = webhookSecret
  ? new LinearWebhookClient(webhookSecret)
  : null;

export function createLinearWebhookRouter() {
  const router = express.Router();

  // Must use raw body for signature verification — no json() before this
  router.post(
    "/linear/webhook",
    express.raw({ type: "application/json" }),
    async (req: Request, res: Response) => {
      const rawBody = req.body;
      if (!rawBody || !Buffer.isBuffer(rawBody)) {
        res.status(400).send("Bad request");
        return;
      }

      if (webhookClient) {
        const signature = req.headers["linear-signature"] as string | undefined;
        if (!signature) {
          res.status(401).send("Missing linear-signature");
          return;
        }
        try {
          webhookClient.verify(rawBody, signature);
        } catch {
          res.status(401).send("Invalid signature");
          return;
        }
      }

      let payload: { type?: string; data?: { id?: string; title?: string; state?: { name?: string }; url?: string } };
      try {
        payload = JSON.parse(rawBody.toString("utf8")) as typeof payload;
      } catch {
        res.status(400).send("Invalid JSON");
        return;
      }

      const type = payload?.type;
      const data = payload?.data;

      if (type === "Issue" && data?.id) {
        const mapping = getMappingByLinearId(data.id);
        if (mapping) {
          const msg = formatIssueUpdate(data);
          const ok = await postToSlackThread(
            mapping.slackChannelId,
            mapping.slackThreadTs,
            msg
          );
          if (!ok) {
            console.error("Failed to post Linear update to Slack thread");
          }
        }
      }

      res.status(200).send();
    }
  );

  return router;
}

function formatIssueUpdate(data: {
  title?: string;
  state?: { name?: string };
  url?: string;
}): string {
  const parts: string[] = ["📋 Linear update:"];
  if (data.title) parts.push(`*${data.title}*`);
  if (data.state?.name) parts.push(`Status: ${data.state.name}`);
  if (data.url) parts.push(data.url);
  return parts.join("\n");
}
