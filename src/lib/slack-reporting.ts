/**
 * Slack reporting for agent status updates (TIN-11 / TIN-21).
 *
 * Format:
 * [ISSUE-ID] Status: <state> Owner: <assignee> Update: <1–2 lines> Next: <next step>
 *
 * Rules: same thread, no duplicates, 3s debounce, ignore bot self-events.
 * Message template system and reporting state machine.
 */

import fs from "fs";
import path from "path";
import { getThreadForIssue } from "@/lib/thread-map";

export interface ReportPayload {
  issueId: string;
  state: string;
  assignee: string;
  update: string;
  next: string;
}

/** Default template per TIN-21 spec. Placeholders: {{issueId}}, {{state}}, {{assignee}}, {{update}}, {{next}} */
export const DEFAULT_REPORT_TEMPLATE =
  "[{{issueId}}] Status: {{state}} Owner: {{assignee}} Update: {{update}} Next: {{next}}";

/** Reporting state machine states. */
export type ReportState =
  | "idle"
  | "pending"
  | "sending"
  | "sent"
  | "duplicate"
  | "error";

/** Truncate update to 1–2 lines to prevent flooding. */
export function truncateUpdate(text: string, maxLines = 2): string {
  const lines = text.split("\n").filter((l) => l.trim());
  return lines.slice(0, maxLines).join("\n").trim() || "(no update)";
}

/** Render template with payload. */
export function renderTemplate(
  template: string,
  payload: ReportPayload
): string {
  const update = truncateUpdate(payload.update);
  return template
    .replace(/\{\{issueId\}\}/g, payload.issueId)
    .replace(/\{\{state\}\}/g, payload.state)
    .replace(/\{\{assignee\}\}/g, payload.assignee)
    .replace(/\{\{update\}\}/g, update)
    .replace(/\{\{next\}\}/g, payload.next);
}

/** Format message per TIN-21 spec using default template. */
export function formatReportMessage(
  payload: ReportPayload,
  template = DEFAULT_REPORT_TEMPLATE
): string {
  return renderTemplate(template, payload);
}

/** Create a content hash for duplicate detection. */
function contentHash(payload: ReportPayload): string {
  const normalized = `${payload.issueId}|${payload.state}|${payload.assignee}|${truncateUpdate(payload.update)}|${payload.next}`;
  return normalized;
}

// --- Debouncer & anti-spam state ---

export const DEBOUNCE_MS = 3000;

interface PendingReport {
  payload: ReportPayload;
  timer: ReturnType<typeof setTimeout>;
}

const pendingByIssue = new Map<string, PendingReport>();
const lastSentByIssue = new Map<string, string>();

/** Reporting state machine: last state per issue. */
const reportStateByIssue = new Map<string, ReportState>();

/** Get current report state for an issue (for observability). */
export function getReportState(issueId: string): ReportState {
  return reportStateByIssue.get(issueId) ?? "idle";
}

/** Debounce: coalesce repeated updates for same issue within 3s. */
function debounce(
  issueId: string,
  payload: ReportPayload,
  send: (p: ReportPayload) => Promise<void>
): void {
  const hash = contentHash(payload);

  // Duplicate: same content as last sent → skip (no spam)
  if (lastSentByIssue.get(issueId) === hash) {
    reportStateByIssue.set(issueId, "duplicate");
    return;
  }

  const existing = pendingByIssue.get(issueId);
  if (existing) {
    clearTimeout(existing.timer);
  }

  reportStateByIssue.set(issueId, "pending");

  const timer = setTimeout(async () => {
    pendingByIssue.delete(issueId);
    // Re-check duplicate (another update may have been sent)
    if (lastSentByIssue.get(issueId) === contentHash(payload)) {
      reportStateByIssue.set(issueId, "duplicate");
      return;
    }
    reportStateByIssue.set(issueId, "sending");
    lastSentByIssue.set(issueId, contentHash(payload));
    try {
      await send(payload);
      reportStateByIssue.set(issueId, "sent");
    } catch {
      reportStateByIssue.set(issueId, "error");
    }
  }, DEBOUNCE_MS);

  pendingByIssue.set(issueId, { payload, timer });
}

/** File-based duplicate check for API route (works across serverless instances). */
interface LastSentEntry {
  hash: string;
  at: number;
}

function getLastSentPath(): string {
  return (
    process.env.SLACK_LAST_SENT_PATH ??
    path.join(process.cwd(), ".slack-last-sent.json")
  );
}

function loadLastSent(): Record<string, LastSentEntry> {
  const p = getLastSentPath();
  try {
    const data = fs.readFileSync(p, "utf-8");
    return JSON.parse(data) as Record<string, LastSentEntry>;
  } catch {
    return {};
  }
}

function saveLastSent(map: Record<string, LastSentEntry>): void {
  const p = getLastSentPath();
  fs.writeFileSync(p, JSON.stringify(map, null, 2), "utf-8");
}

/** Returns true if this report is a duplicate (same content within 3s). */
export function isDuplicateReport(
  issueId: string,
  payload: ReportPayload
): boolean {
  const map = loadLastSent();
  const entry = map[issueId];
  const hash = contentHash(payload);
  if (!entry) return false;
  if (entry.hash !== hash) return false;
  return Date.now() - entry.at < DEBOUNCE_MS;
}

export function markAsSent(issueId: string, payload: ReportPayload): void {
  const map = loadLastSent();
  map[issueId] = { hash: contentHash(payload), at: Date.now() };
  saveLastSent(map);
}

// --- Thread mapping (issue → thread_ts) ---

function getThreadMapPath(): string {
  return (
    process.env.SLACK_THREADS_PATH ??
    path.join(process.cwd(), ".slack-threads.json")
  );
}

function loadThreadMap(): Record<string, string> {
  try {
    const data = fs.readFileSync(getThreadMapPath(), "utf-8");
    return JSON.parse(data) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveThreadMap(map: Record<string, string>): void {
  fs.writeFileSync(getThreadMapPath(), JSON.stringify(map, null, 2), "utf-8");
}

// --- Slack API ---

async function postToSlack(
  text: string,
  channel: string,
  threadTs: string | null,
  token: string
): Promise<{ ts?: string; ok: boolean; error?: string }> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel,
      text,
      thread_ts: threadTs ?? undefined,
    }),
  });

  const json = (await res.json()) as {
    ok?: boolean;
    ts?: string;
    error?: string;
  };

  return {
    ok: json.ok === true,
    ts: json.ts,
    error: json.error,
  };
}

export interface SlackReportConfig {
  token: string;
  channel: string;
  template?: string;
}

/**
 * Report status to Slack. Uses same thread per issue, debounces 3s, skips duplicates.
 * Call this from the gateway; agents should use the API route, not this directly.
 */
export async function reportToSlack(
  payload: ReportPayload,
  config: SlackReportConfig
): Promise<{ success: boolean; error?: string }> {
  const { token, channel, template } = config;
  if (!token || !channel) {
    return { success: false, error: "Slack token and channel required" };
  }

  reportStateByIssue.set(payload.issueId, "sending");

  const text = formatReportMessage(payload, template);

  // Prefer thread-map (Linear-linked threads) when available; else use .slack-threads.json
  const mappedThread = getThreadForIssue(payload.issueId);
  const localThreadMap = loadThreadMap();
  const channelToUse = mappedThread?.channelId ?? channel;
  const threadTs =
    mappedThread?.threadTs ?? localThreadMap[payload.issueId] ?? null;

  const result = await postToSlack(text, channelToUse, threadTs, token);

  if (!result.ok) {
    reportStateByIssue.set(payload.issueId, "error");
    return { success: false, error: result.error ?? "Slack API error" };
  }

  reportStateByIssue.set(payload.issueId, "sent");

  // First message in thread: store ts for future replies (only when using default channel)
  if (!threadTs && result.ts && !mappedThread) {
    localThreadMap[payload.issueId] = result.ts;
    saveThreadMap(localThreadMap);
  }

  return { success: true };
}

/**
 * Debounced report: coalesces rapid updates for same issue (3s).
 * Use this when agents may fire many events in quick succession.
 */
export function reportToSlackDebounced(
  payload: ReportPayload,
  config: SlackReportConfig
): void {
  debounce(payload.issueId, payload, async (p) => {
    await reportToSlack(p, config);
  });
}

/**
 * Check if an event is from our bot (ignore self-events to prevent loops).
 * Use when handling Slack events (e.g. Events API) — not needed for outgoing reports.
 */
export function isBotSelfEvent(botUserId: string, eventUserId?: string): boolean {
  return eventUserId === botUserId;
}
