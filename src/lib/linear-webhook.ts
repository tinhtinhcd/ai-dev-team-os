/**
 * Linear webhook payload types and event formatting for Slack.
 */

export type LinearWebhookAction = "create" | "update" | "remove";

export type LinearWebhookPayload = {
  action: LinearWebhookAction;
  type: string;
  data: Record<string, unknown>;
  updatedFrom?: Record<string, unknown>;
  createdAt?: string;
  organizationId?: string;
  webhookTimestamp?: number;
  webhookId?: string;
};

// Issue data shape (simplified)
type IssueData = {
  identifier?: string;
  title?: string;
  url?: string;
  state?: { name?: string; type?: string };
  assignee?: { name?: string; displayName?: string } | null;
  description?: string | null;
  [key: string]: unknown;
};

// Comment data shape
type CommentData = {
  id?: string;
  body?: string;
  issue?: { identifier?: string; title?: string };
  user?: { name?: string; displayName?: string };
  [key: string]: unknown;
};

// Attachment data shape (for PR links)
type AttachmentData = {
  id?: string;
  url?: string;
  title?: string;
  metadata?: { pullRequestNumber?: number; pullRequestTitle?: string };
  issue?: { identifier?: string };
  [key: string]: unknown;
};

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

function getIssueIdentifier(data: Record<string, unknown>): string | null {
  const issue = data as IssueData;
  return issue.identifier ?? (issue.issue as { identifier?: string })?.identifier ?? null;
}

/**
 * Format Slack message for Issue created.
 */
export function formatIssueCreated(payload: LinearWebhookPayload): string {
  const d = payload.data as IssueData;
  const id = d.identifier ?? "?";
  const title = d.title ?? "Untitled";
  const url = d.url ?? "";
  const state = d.state?.name ?? d.state?.type ?? "—";
  const assignee = d.assignee?.displayName ?? d.assignee?.name ?? "Unassigned";
  return [
    `📋 *Issue created: ${id}*`,
    `Title: ${title}`,
    `Status: ${state} | Assignee: ${assignee}`,
    url ? `<${url}|Open in Linear>` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Format Slack message for Issue updated.
 * Detects state changed, assignee changed, and other updates.
 */
export function formatIssueUpdated(payload: LinearWebhookPayload): string {
  const d = payload.data as IssueData;
  const from = payload.updatedFrom ?? {};
  const id = d.identifier ?? "?";
  const title = d.title ?? "Untitled";
  const url = d.url ?? "";

  const changes: string[] = [];

  const prevState = (from as Record<string, unknown>).state as { name?: string } | undefined;
  const currState = d.state?.name ?? d.state?.type;
  if (prevState && currState && prevState.name !== currState) {
    changes.push(`Status: ${prevState.name ?? "?"} → ${currState}`);
  }

  const prevAssignee = (from as Record<string, unknown>).assignee as { displayName?: string; name?: string } | undefined;
  const currAssignee = d.assignee?.displayName ?? d.assignee?.name ?? null;
  const prevAssigneeName = prevAssignee?.displayName ?? prevAssignee?.name ?? "Unassigned";
  const currAssigneeName = currAssignee ?? "Unassigned";
  if (prevAssigneeName !== currAssigneeName) {
    changes.push(`Assignee: ${prevAssigneeName} → ${currAssigneeName}`);
  }

  if (changes.length === 0) {
    changes.push("General update");
  }

  return [
    `\u2705 *Issue updated: ${id}* — ${title}`,
    changes.join(" | "),
    url ? `<${url}|Open in Linear>` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Format Slack message for Comment created.
 */
export function formatCommentCreated(payload: LinearWebhookPayload): string {
  const d = payload.data as CommentData;
  const issue = d.issue;
  const id = issue?.identifier ?? "?";
  const author = d.user?.displayName ?? d.user?.name ?? "Someone";
  const body = d.body ? truncate(String(d.body).replace(/\n/g, " "), 200) : "";
  return [
    `💬 *Comment on ${id}* by ${author}`,
    body || "(no content)",
  ].join("\n");
}

/**
 * Format Slack message for PR link / attachment added.
 */
export function formatPrLinkAdded(payload: LinearWebhookPayload): string {
  const d = payload.data as AttachmentData;
  const issueId = d.issue?.identifier ?? "?";
  const url = d.url ?? "";
  const title = d.title ?? d.metadata?.pullRequestTitle ?? "PR";
  const prNum = d.metadata?.pullRequestNumber;
  const label = prNum ? `PR #${prNum}` : title;
  return [
    `📁 *PR link added to ${issueId}*`,
    url ? `<${url}|${label}>` : label,
  ].join("\n");
}

/**
 * Determine if an Issue update represents a PR link being added.
 * Linear may send this as IssueAttachment create or as an Issue update with new attachment.
 */
export function isPrLinkAttachment(data: Record<string, unknown>): boolean {
  const a = data as AttachmentData;
  const url = (a.url ?? "") as string;
  const meta = a.metadata as { pullRequestNumber?: number } | undefined;
  return (
    (url.includes("github.com") && url.includes("/pull/")) ||
    (url.includes("gitlab.com") && (url.includes("/merge_requests/") || url.includes("/-/merge_requests/"))) ||
    !!meta?.pullRequestNumber
  );
}

/**
 * Route payload to appropriate formatter and return Slack message.
 */
export function formatLinearEventForSlack(payload: LinearWebhookPayload): {
  message: string;
  issueIdentifier: string | null;
} | null {
  const { action, type, data } = payload;

  if (type === "Issue") {
    const id = getIssueIdentifier(data);
    if (action === "create") {
      return { message: formatIssueCreated(payload), issueIdentifier: id };
    }
    if (action === "update") {
      return { message: formatIssueUpdated(payload), issueIdentifier: id };
    }
  }

  if (type === "Comment" && action === "create") {
    const commentData = data as CommentData;
    const id = commentData.issue?.identifier ?? null;
    return {
      message: formatCommentCreated(payload),
      issueIdentifier: id,
    };
  }

  if (type === "IssueAttachment" && action === "create") {
    if (isPrLinkAttachment(data)) {
      const attachmentData = data as AttachmentData;
      const id = attachmentData.issue?.identifier ?? null;
      return {
        message: formatPrLinkAdded(payload),
        issueIdentifier: id,
      };
    }
  }

  return null;
}
