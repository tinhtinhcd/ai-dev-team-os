/**
 * Persistent event logging for Linear webhooks.
 * Stores raw payloads for replay and reconciliation.
 */

import fs from "fs";
import path from "path";

export type StoredEventStatus = "received" | "processed" | "skipped" | "failed";

export interface StoredLinearEvent {
  id: string;
  webhookId?: string;
  webhookTimestamp?: number;
  receivedAt: string;
  type: string;
  action: string;
  issueIdentifier?: string;
  issueId?: string;
  status: StoredEventStatus;
  rawPayload: Record<string, unknown>;
  error?: string;
}

const DEFAULT_EVENTS_PATH = path.join(process.cwd(), "data", "linear-events.json");

function getEventsPath(): string {
  return process.env.LINEAR_EVENTS_PATH ?? DEFAULT_EVENTS_PATH;
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadEvents(): StoredLinearEvent[] {
  const filePath = getEventsPath();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveEvents(events: StoredLinearEvent[]): void {
  const filePath = getEventsPath();
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(events, null, 2), "utf-8");
}

function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Store a received webhook event.
 */
export function storeEvent(
  payload: Record<string, unknown>,
  status: StoredEventStatus = "received",
  error?: string
): StoredLinearEvent {
  const data = payload.data as Record<string, unknown> | undefined;
  const issueIdentifier =
    (data?.identifier as string) ??
    (data?.issue as { identifier?: string })?.identifier;
  const issueId = data?.id as string | undefined;

  const event: StoredLinearEvent = {
    id: generateId(),
    webhookId: payload.webhookId as string | undefined,
    webhookTimestamp: payload.webhookTimestamp as number | undefined,
    receivedAt: new Date().toISOString(),
    type: (payload.type as string) ?? "unknown",
    action: (payload.action as string) ?? "unknown",
    issueIdentifier: issueIdentifier ?? undefined,
    issueId,
    status,
    rawPayload: payload,
    error,
  };

  const events = loadEvents();
  events.push(event);
  // Keep last 10,000 events to avoid unbounded growth
  const trimmed = events.slice(-10000);
  saveEvents(trimmed);
  return event;
}

/**
 * Update event status after processing.
 */
export function updateEventStatus(
  id: string,
  status: StoredEventStatus,
  error?: string
): boolean {
  const events = loadEvents();
  const idx = events.findIndex((e) => e.id === id);
  if (idx < 0) return false;
  events[idx].status = status;
  if (error) events[idx].error = error;
  saveEvents(events);
  return true;
}

/**
 * Query events by issue identifier, date range, or status.
 */
export function queryEvents(options?: {
  issueIdentifier?: string;
  issueId?: string;
  type?: string;
  status?: StoredEventStatus;
  since?: string;
  limit?: number;
}): StoredLinearEvent[] {
  let events = loadEvents();
  if (options?.issueIdentifier) {
    events = events.filter((e) => e.issueIdentifier === options.issueIdentifier);
  }
  if (options?.issueId) {
    events = events.filter((e) => e.issueId === options.issueId);
  }
  if (options?.type) {
    events = events.filter((e) => e.type === options.type);
  }
  if (options?.status) {
    events = events.filter((e) => e.status === options.status);
  }
  if (options?.since) {
    const sinceDate = new Date(options.since).getTime();
    events = events.filter((e) => new Date(e.receivedAt).getTime() >= sinceDate);
  }
  const limit = options?.limit ?? 100;
  return events.slice(-limit);
}
