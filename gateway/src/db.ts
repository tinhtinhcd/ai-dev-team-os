import Database from "better-sqlite3";
import { join } from "path";

const dbPath = process.env.LOCAL_DB_PATH ?? join(process.cwd(), "gateway.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS issue_mappings (
    linear_issue_id TEXT PRIMARY KEY,
    slack_channel_id TEXT NOT NULL,
    slack_thread_ts TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migration: add issue_identifier if missing (for existing DBs)
try {
  const cols = db.prepare("PRAGMA table_info(issue_mappings)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "issue_identifier")) {
    db.exec("ALTER TABLE issue_mappings ADD COLUMN issue_identifier TEXT");
  }
} catch {
  // ignore
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_issue_identifier ON issue_mappings(issue_identifier);
  CREATE INDEX IF NOT EXISTS idx_slack_channel_thread ON issue_mappings(slack_channel_id, slack_thread_ts);

  CREATE TABLE IF NOT EXISTS linear_events (
    id TEXT PRIMARY KEY,
    webhook_id TEXT,
    webhook_timestamp INTEGER,
    received_at TEXT DEFAULT (datetime('now')),
    type TEXT NOT NULL,
    action TEXT NOT NULL,
    issue_identifier TEXT,
    issue_id TEXT,
    status TEXT DEFAULT 'received',
    raw_payload TEXT,
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_events_issue ON linear_events(issue_identifier, issue_id);
  CREATE INDEX IF NOT EXISTS idx_events_status ON linear_events(status);

  CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    series_id TEXT NOT NULL,
    number INTEGER NOT NULL,
    title TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(series_id, number)
  );

  CREATE INDEX IF NOT EXISTS idx_chapters_series ON chapters(series_id);
`);

export interface IssueMapping {
  linearIssueId: string;
  slackChannelId: string;
  slackThreadTs: string;
}

export function storeMapping(
  linearIssueId: string,
  slackChannelId: string,
  slackThreadTs: string,
  issueIdentifier?: string
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO issue_mappings (linear_issue_id, issue_identifier, slack_channel_id, slack_thread_ts)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(linearIssueId, issueIdentifier ?? null, slackChannelId, slackThreadTs);
}

export function getMappingByLinearId(linearIssueId: string): IssueMapping | null {
  const row = db
    .prepare(
      `SELECT linear_issue_id as linearIssueId, slack_channel_id as slackChannelId, slack_thread_ts as slackThreadTs
       FROM issue_mappings WHERE linear_issue_id = ?`
    )
    .get(linearIssueId) as IssueMapping | undefined;
  return row ?? null;
}

export function getMappingByIdentifier(issueIdentifier: string): IssueMapping | null {
  const row = db
    .prepare(
      `SELECT linear_issue_id as linearIssueId, slack_channel_id as slackChannelId, slack_thread_ts as slackThreadTs
       FROM issue_mappings WHERE issue_identifier = ?`
    )
    .get(issueIdentifier) as IssueMapping | undefined;
  return row ?? null;
}

export function getMappingBySlack(
  slackChannelId: string,
  slackThreadTs: string
): IssueMapping | null {
  const row = db
    .prepare(
      `SELECT linear_issue_id as linearIssueId, slack_channel_id as slackChannelId, slack_thread_ts as slackThreadTs
       FROM issue_mappings WHERE slack_channel_id = ? AND slack_thread_ts = ?`
    )
    .get(slackChannelId, slackThreadTs) as IssueMapping | undefined;
  return row ?? null;
}

export type EventStatus = "received" | "processed" | "skipped" | "failed";

export function storeLinearEvent(
  payload: Record<string, unknown>,
  status: EventStatus = "received",
  error?: string
): string {
  const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const data = payload.data as Record<string, unknown> | undefined;
  const issueIdentifier =
    (data?.identifier as string) ?? (data?.issue as { identifier?: string })?.identifier;
  const issueId = data?.id as string | undefined;

  const stmt = db.prepare(`
    INSERT INTO linear_events (id, webhook_id, webhook_timestamp, type, action, issue_identifier, issue_id, status, raw_payload, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    payload.webhookId ?? null,
    payload.webhookTimestamp ?? null,
    payload.type ?? "unknown",
    payload.action ?? "unknown",
    issueIdentifier ?? null,
    issueId ?? null,
    status,
    JSON.stringify(payload),
    error ?? null
  );
  return id;
}

export function updateLinearEventStatus(id: string, status: EventStatus, error?: string): boolean {
  const stmt = db.prepare(`UPDATE linear_events SET status = ?, error = ? WHERE id = ?`);
  const result = stmt.run(status, error ?? null, id);
  return result.changes > 0;
}

// --- Chapters (concurrency-safe per series, TIN-37) ---

export interface Chapter {
  id: number;
  seriesId: string;
  number: number;
  title: string | null;
  createdAt: string;
}

const MAX_RETRIES = 5;

/**
 * Creates a chapter with the next available number for the series.
 * Uses UNIQUE(series_id, number) + retry on conflict to avoid duplicates under concurrent requests.
 */
export function createChapter(
  seriesId: string,
  title?: string | null
): Chapter {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      db.prepare(`
        INSERT INTO chapters (series_id, number, title)
        SELECT ?, COALESCE(MAX(number), 0) + 1, ?
        FROM chapters WHERE series_id = ?
      `).run(seriesId, title ?? null, seriesId);

      const row = db
        .prepare(
          `SELECT id, series_id as seriesId, number, title, created_at as createdAt
           FROM chapters WHERE series_id = ? ORDER BY number DESC LIMIT 1`
        )
        .get(seriesId) as Chapter;
      return row;
    } catch (err) {
      const sqliteErr = err as { code?: string };
      if (sqliteErr?.code === "SQLITE_CONSTRAINT_UNIQUE" && attempt < MAX_RETRIES - 1) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("createChapter: max retries exceeded");
}
