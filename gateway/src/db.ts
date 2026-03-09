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

  CREATE INDEX IF NOT EXISTS idx_slack_channel_thread ON issue_mappings(slack_channel_id, slack_thread_ts);

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
  slackThreadTs: string
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO issue_mappings (linear_issue_id, slack_channel_id, slack_thread_ts)
    VALUES (?, ?, ?)
  `);
  stmt.run(linearIssueId, slackChannelId, slackThreadTs);
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
