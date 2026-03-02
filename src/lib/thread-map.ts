/**
 * Maps Linear issue identifiers to Slack thread locations.
 * Format: { "TIN-1": { channelId: "C0ABQLYUE0K", threadTs: "1772317278.962769" } }
 */
import fs from "fs";
import path from "path";

export type ThreadLocation = {
  channelId: string;
  threadTs: string;
};

const DEFAULT_MAP_PATH = path.join(process.cwd(), "data", "linear-thread-map.json");

function getMapPath(): string {
  return process.env.LINEAR_THREAD_MAP_PATH ?? DEFAULT_MAP_PATH;
}

function loadMap(): Record<string, ThreadLocation> {
  const mapPath = getMapPath();
  const dir = path.dirname(mapPath);
  if (!fs.existsSync(dir)) {
    return {};
  }
  if (!fs.existsSync(mapPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(mapPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, ThreadLocation>;
    }
  } catch {
    // ignore
  }
  return {};
}

/**
 * Get the Slack thread location for a Linear issue.
 */
export function getThreadForIssue(identifier: string): ThreadLocation | null {
  const map = loadMap();
  return map[identifier] ?? null;
}

/**
 * Get the Slack destination for an issue.
 * Returns mapped thread if exists; otherwise returns default channel.
 */
export function getSlackDestination(identifier: string): {
  channelId: string;
  threadTs?: string;
} {
  const mapped = getThreadForIssue(identifier);
  const defaultChannel = process.env.SLACK_CHANNEL_ID;
  if (mapped) {
    return { channelId: mapped.channelId, threadTs: mapped.threadTs };
  }
  if (defaultChannel) {
    return { channelId: defaultChannel };
  }
  return { channelId: "" };
}

/**
 * Store or update the Slack thread mapping for a Linear issue.
 * Used when creating Linear issues from Slack (Van Bot).
 */
export function setThreadForIssue(
  identifier: string,
  channelId: string,
  threadTs: string
): void {
  const mapPath = getMapPath();
  const dir = path.dirname(mapPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const map = loadMap();
  map[identifier] = { channelId, threadTs };
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2), "utf-8");
}
