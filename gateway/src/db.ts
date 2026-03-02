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
