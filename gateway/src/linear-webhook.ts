import { LinearWebhookClient } from "@linear/sdk/webhooks";
import express, { Request, Response } from "express";
import {
  getMappingByLinearId,
  getMappingByIdentifier,
  storeLinearEvent,
  updateLinearEventStatus,
} from "./db.js";
import { postToSlackThread } from "./slack.js";

const webhookSecret = process.env.LINEAR_WEBHOOK_SECRET;
if (!webhookSecret) {
  console.warn("LINEAR_WEBHOOK_SECRET not set — Linear webhook signature verification disabled");
}

const webhookClient = webhookSecret
  ? new LinearWebhookClient(webhookSecret)
  : null;

type PayloadData = Record<string, unknown>;

function getIssueIdentifier(data: PayloadData): string | null {
  const identifier = data.identifier as string | undefined;
  if (identifier) return identifier;
  const issue = data.issue as { identifier?: string } | undefined;
  return issue?.identifier ?? null;
}

function getIssueId(data: PayloadData): string | null {
  return (data.id as string) ?? null;
}

function formatIssueCreated(data: PayloadData): string {
  const id = (data.identifier as string) ?? "?";
  const title = (data.title as string) ?? "Untitled";
  const url = (data.url as string) ?? "";
  const state = (data.state as { name?: string })?.name ?? (data.state as { type?: string })?.type ?? "—";
  const assignee = (data.assignee as { displayName?: string; name?: string })?.displayName
    ?? (data.assignee as { displayName?: string; name?: string })?.name
    ?? "Unassigned";
  const lines = [
    `📋 *Issue created: ${id}*`,
    `Title: ${title}`,
    `Status: ${state} | Assignee: ${assignee}`,
    url ? `<${url}|Open in Linear>` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatIssueUpdated(data: PayloadData, updatedFrom: PayloadData): string {
  const id = (data.identifier as string) ?? "?";
  const title = (data.title as string) ?? "Untitled";
  const url = (data.url as string) ?? "";
  const changes: string[] = [];

  const prevState = updatedFrom?.state as { name?: string } | undefined;
  const currState = (data.state as { name?: string })?.name ?? (data.state as { type?: string });
  if (prevState && currState && prevState.name !== currState) {
    changes.push(`Status: ${prevState.name ?? "?"} → ${currState}`);
  }

  const prevAssignee = updatedFrom?.assignee as { displayName?: string; name?: string } | undefined;
  const currAssignee = data.assignee as { displayName?: string; name?: string } | null;
  const prevName = prevAssignee?.displayName ?? prevAssignee?.name ?? "Unassigned";
  const currName = currAssignee?.displayName ?? currAssignee?.name ?? "Unassigned";
  if (prevName !== currName) {
    changes.push(`Assignee: ${prevName} → ${currName}`);
  }

  if (changes.length === 0) changes.push("General update");

  const lines = [
    `✅ *Issue updated: ${id}* — ${title}`,
    changes.join(" | "),
    url ? `<${url}|Open in Linear>` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function formatCommentCreated(data: PayloadData): string {
  const issue = data.issue as { identifier?: string } | undefined;
  const id = issue?.identifier ?? "?";
  const author = (data.user as { displayName?: string; name?: string })?.displayName
    ?? (data.user as { displayName?: string; name?: string })?.name
    ?? "Someone";
  let body = (data.body as string) ?? "";
  body = body.replace(/\n/g, " ");
  if (body.length > 200) body = body.slice(0, 197) + "...";
  return `💬 *Comment on ${id}* by ${author}\n${body || "(no content)"}`;
}

function isPrLinkAttachment(data: PayloadData): boolean {
  const url = (data.url as string) ?? "";
  const meta = data.metadata as { pullRequestNumber?: number } | undefined;
  return (
    (url.includes("github.com") && url.includes("/pull/")) ||
    (url.includes("gitlab.com") && (url.includes("/merge_requests/") || url.includes("/-/merge_requests/"))) ||
    !!meta?.pullRequestNumber
  );
}

function formatPrLinkAdded(data: PayloadData): string {
  const issue = data.issue as { identifier?: string } | undefined;
  const id = issue?.identifier ?? "?";
  const url = (data.url as string) ?? "";
  const title = (data.title as string) ?? (data.metadata as { pullRequestTitle?: string })?.pullRequestTitle ?? "PR";
  const prNum = (data.metadata as { pullRequestNumber?: number })?.pullRequestNumber;
  const label = prNum ? `PR #${prNum}` : title;
  return `📁 *PR link added to ${id}*\n${url ? `<${url}|${label}>` : label}`;
}

function formatEvent(
  type: string,
  action: string,
  data: PayloadData,
  updatedFrom?: PayloadData
): { message: string; issueIdentifier: string | null; issueId: string | null } | null {
  if (type === "Issue") {
    if (action === "create") {
      return {
        message: formatIssueCreated(data),
        issueIdentifier: getIssueIdentifier(data),
        issueId: getIssueId(data),
      };
    }
    if (action === "update") {
      return {
        message: formatIssueUpdated(data, updatedFrom ?? {}),
        issueIdentifier: getIssueIdentifier(data),
        issueId: getIssueId(data),
      };
    }
  }

  if ((type === "Comment" || type === "IssueComment") && action === "create") {
    return {
      message: formatCommentCreated(data),
      issueIdentifier: getIssueIdentifier(data),
      issueId: null,
    };
  }

  if (type === "IssueAttachment" && action === "create" && isPrLinkAttachment(data)) {
    return {
      message: formatPrLinkAdded(data),
      issueIdentifier: getIssueIdentifier(data),
      issueId: null,
    };
  }

  return null;
}

export function createLinearWebhookRouter() {
  const router = express.Router();

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

      let payload: { type?: string; action?: string; data?: PayloadData; updatedFrom?: PayloadData };
      try {
        payload = JSON.parse(rawBody.toString("utf8")) as typeof payload;
      } catch {
        res.status(400).send("Invalid JSON");
        return;
      }

      const type = payload?.type;
      const action = payload?.action ?? "update";
      const data = payload?.data;
      const updatedFrom = payload?.updatedFrom;

      const payloadObj = payload as Record<string, unknown>;
      const storedId = storeLinearEvent(payloadObj, "received");

      if (!type || !data) {
        updateLinearEventStatus(storedId, "skipped");
        res.status(200).send();
        return;
      }

      const formatted = formatEvent(type, action, data, updatedFrom);
      if (!formatted) {
        updateLinearEventStatus(storedId, "skipped");
        res.status(200).send();
        return;
      }

      const { message, issueIdentifier, issueId } = formatted;
      let mapping = null;
      if (issueId) {
        mapping = getMappingByLinearId(issueId);
      }
      if (!mapping && issueIdentifier) {
        mapping = getMappingByIdentifier(issueIdentifier);
      }

      if (!mapping) {
        updateLinearEventStatus(storedId, "skipped", "No Slack mapping for issue");
        res.status(200).send();
        return;
      }

      const ok = await postToSlackThread(
        mapping.slackChannelId,
        mapping.slackThreadTs,
        message
      );

      if (ok) {
        updateLinearEventStatus(storedId, "processed");
      } else {
        updateLinearEventStatus(storedId, "failed", "Failed to post to Slack");
        console.error("Failed to post Linear update to Slack thread");
      }

      res.status(200).send();
    }
  );

  return router;
}
