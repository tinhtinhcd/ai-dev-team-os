import fs from "fs";
import path from "path";

export type CallRole = "architect" | "engineer" | "reviewer";
export type DateRange = "today" | "last7";

type Bucket = {
  tokens: number;
  calls: number;
};

type Buckets = Record<string, Bucket>;

type TaskAggregate = {
  taskId: string;
  tokens: number;
  calls: number;
  byRole: Buckets;
  byAction: Buckets;
  byModel: Buckets;
  byRoleAction: Buckets;
};

type DayAggregate = {
  date: string;
  tokens: number;
  calls: number;
  byRole: Buckets;
  byAction: Buckets;
  byRoleAction: Buckets;
  tasks: Record<string, TaskAggregate>;
};

type UsageCache = {
  version: number;
  lastProcessedByteOffset: number;
  pendingLine: string;
  days: Record<string, DayAggregate>;
};

type AiCallLog = {
  ts: string;
  role: CallRole;
  action: string;
  channel_id: string;
  thread_ts: string;
  task_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  success: boolean;
  error_code: string | null;
  cache_hit: boolean | null;
};

export type UsageFilters = {
  range: DateRange;
  role?: CallRole;
  action?: string;
};

export type TopTask = {
  taskId: string;
  tokens: number;
  calls: number;
  byRole: Buckets;
  byAction: Buckets;
  byModel: Buckets;
};

export type ObservabilityData = {
  today: {
    tokens: number;
    calls: number;
    estimatedCostUsd: number;
    byRole: Buckets;
    byAction: Buckets;
  };
  last7Days: Array<{
    date: string;
    tokens: number;
    calls: number;
  }>;
  topTasksToday: TopTask[];
  availableActions: string[];
};

const LOGS_DIR = path.join(process.cwd(), "logs");
const CALLS_LOG_PATH = path.join(LOGS_DIR, "ai_calls.jsonl");
const CACHE_PATH = path.join(LOGS_DIR, "usage_cache.json");
const CACHE_VERSION = 1;
const ROLES: CallRole[] = ["architect", "engineer", "reviewer"];

const SAMPLE_MODELS = ["gpt-4.1", "gpt-4o-mini", "claude-sonnet"];
const SAMPLE_ACTIONS = ["plan_task", "implement_task", "review_pr", "debug_issue"];
const SAMPLE_CHANNELS = ["C-ENG", "C-ARCH", "C-REV"];

function ensureLogsReady(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  if (fs.existsSync(CALLS_LOG_PATH)) {
    return;
  }

  if (process.env.NODE_ENV === "development") {
    const now = new Date();
    const lines: string[] = [];
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      for (let i = 0; i < 8; i += 1) {
        const ts = new Date(
          now.getTime() - dayOffset * 24 * 60 * 60 * 1000 - i * 15 * 60 * 1000
        ).toISOString();
        const role = ROLES[(i + dayOffset) % ROLES.length];
        const action = SAMPLE_ACTIONS[(i + dayOffset) % SAMPLE_ACTIONS.length];
        const promptTokens = 250 + i * 40 + dayOffset * 10;
        const completionTokens = 500 + i * 70 + dayOffset * 20;
        const totalTokens = promptTokens + completionTokens;
        const taskId = `TASK-${100 + ((i + dayOffset) % 12)}`;
        const entry: AiCallLog = {
          ts,
          role,
          action,
          channel_id: SAMPLE_CHANNELS[(i + dayOffset) % SAMPLE_CHANNELS.length],
          thread_ts: `${Math.floor(now.getTime() / 1000)}.${dayOffset}${i}`,
          task_id: taskId,
          model: SAMPLE_MODELS[(i + dayOffset) % SAMPLE_MODELS.length],
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          latency_ms: 400 + i * 35,
          success: i % 6 !== 0,
          error_code: i % 6 === 0 ? "RATE_LIMIT" : null,
          cache_hit: i % 4 === 0,
        };
        lines.push(JSON.stringify(entry));
      }
    }
    fs.writeFileSync(CALLS_LOG_PATH, `${lines.join("\n")}\n`, "utf-8");
    return;
  }

  fs.writeFileSync(CALLS_LOG_PATH, "", "utf-8");
}

function emptyBucket(): Bucket {
  return { tokens: 0, calls: 0 };
}

function emptyDayAggregate(date: string): DayAggregate {
  return {
    date,
    tokens: 0,
    calls: 0,
    byRole: {},
    byAction: {},
    byRoleAction: {},
    tasks: {},
  };
}

function emptyTaskAggregate(taskId: string): TaskAggregate {
  return {
    taskId,
    tokens: 0,
    calls: 0,
    byRole: {},
    byAction: {},
    byModel: {},
    byRoleAction: {},
  };
}

function addToBuckets(buckets: Buckets, key: string, tokens: number): void {
  if (!buckets[key]) {
    buckets[key] = emptyBucket();
  }
  buckets[key].tokens += tokens;
  buckets[key].calls += 1;
}

function toUtcDay(isoTs: string): string | null {
  const date = new Date(isoTs);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function parseLine(line: string): AiCallLog | null {
  try {
    const parsed = JSON.parse(line) as Partial<AiCallLog>;
    if (
      !parsed ||
      typeof parsed.ts !== "string" ||
      typeof parsed.role !== "string" ||
      !ROLES.includes(parsed.role as CallRole) ||
      typeof parsed.action !== "string" ||
      typeof parsed.task_id !== "string" ||
      typeof parsed.model !== "string" ||
      typeof parsed.prompt_tokens !== "number" ||
      typeof parsed.completion_tokens !== "number" ||
      typeof parsed.total_tokens !== "number" ||
      typeof parsed.latency_ms !== "number" ||
      typeof parsed.success !== "boolean"
    ) {
      return null;
    }
    return parsed as AiCallLog;
  } catch {
    return null;
  }
}

function loadCache(): UsageCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return {
      version: CACHE_VERSION,
      lastProcessedByteOffset: 0,
      pendingLine: "",
      days: {},
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as UsageCache;
    if (
      !parsed ||
      parsed.version !== CACHE_VERSION ||
      typeof parsed.lastProcessedByteOffset !== "number" ||
      typeof parsed.pendingLine !== "string" ||
      typeof parsed.days !== "object"
    ) {
      throw new Error("Invalid cache shape.");
    }
    return parsed;
  } catch {
    return {
      version: CACHE_VERSION,
      lastProcessedByteOffset: 0,
      pendingLine: "",
      days: {},
    };
  }
}

function persistCache(cache: UsageCache): void {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

function readBytesFromOffset(filePath: string, offset: number): { text: string; size: number } {
  const stats = fs.statSync(filePath);
  const size = stats.size;

  if (size <= offset) {
    return { text: "", size };
  }

  const fd = fs.openSync(filePath, "r");
  try {
    const length = size - offset;
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, offset);
    return {
      text: buffer.toString("utf-8", 0, bytesRead),
      size,
    };
  } finally {
    fs.closeSync(fd);
  }
}

function ingestLog(cache: UsageCache, log: AiCallLog): void {
  const dayKey = toUtcDay(log.ts);
  if (!dayKey) {
    return;
  }

  if (!cache.days[dayKey]) {
    cache.days[dayKey] = emptyDayAggregate(dayKey);
  }
  const day = cache.days[dayKey];
  const roleActionKey = `${log.role}::${log.action}`;

  day.tokens += log.total_tokens;
  day.calls += 1;
  addToBuckets(day.byRole, log.role, log.total_tokens);
  addToBuckets(day.byAction, log.action, log.total_tokens);
  addToBuckets(day.byRoleAction, roleActionKey, log.total_tokens);

  if (!day.tasks[log.task_id]) {
    day.tasks[log.task_id] = emptyTaskAggregate(log.task_id);
  }
  const task = day.tasks[log.task_id];
  task.tokens += log.total_tokens;
  task.calls += 1;
  addToBuckets(task.byRole, log.role, log.total_tokens);
  addToBuckets(task.byAction, log.action, log.total_tokens);
  addToBuckets(task.byModel, log.model, log.total_tokens);
  addToBuckets(task.byRoleAction, roleActionKey, log.total_tokens);
}

function syncUsageCache(): UsageCache {
  ensureLogsReady();
  let cache = loadCache();
  const fileSize = fs.statSync(CALLS_LOG_PATH).size;

  // File rotated or truncated; rebuild cache from scratch.
  if (fileSize < cache.lastProcessedByteOffset) {
    cache = {
      version: CACHE_VERSION,
      lastProcessedByteOffset: 0,
      pendingLine: "",
      days: {},
    };
  }

  const { text, size } = readBytesFromOffset(CALLS_LOG_PATH, cache.lastProcessedByteOffset);
  if (!text && size === cache.lastProcessedByteOffset) {
    return cache;
  }

  const combined = `${cache.pendingLine}${text}`;
  const lines = combined.split(/\r?\n/);
  cache.pendingLine = lines.pop() ?? "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    const parsed = parseLine(line);
    if (!parsed) {
      continue;
    }
    ingestLog(cache, parsed);
  }

  cache.lastProcessedByteOffset = size;
  persistCache(cache);
  return cache;
}

function getTodayUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDateKeys(range: DateRange): string[] {
  if (range === "today") {
    return [getTodayUtcDateKey()];
  }

  const keys: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setUTCDate(now.getUTCDate() - i);
    keys.push(date.toISOString().slice(0, 10));
  }
  return keys;
}

function getFilteredBucket(
  tokens: number,
  calls: number,
  byRole: Buckets,
  byAction: Buckets,
  byRoleAction: Buckets,
  role?: CallRole,
  action?: string
): Bucket {
  if (role && action) {
    return byRoleAction[`${role}::${action}`] ?? emptyBucket();
  }
  if (role) {
    return byRole[role] ?? emptyBucket();
  }
  if (action) {
    return byAction[action] ?? emptyBucket();
  }
  return { tokens, calls };
}

function sortBucketsDesc(buckets: Buckets): Buckets {
  return Object.fromEntries(
    Object.entries(buckets).sort((a, b) => b[1].tokens - a[1].tokens)
  );
}

export function getObservabilityData(filters: UsageFilters): ObservabilityData {
  const cache = syncUsageCache();
  const todayKey = getTodayUtcDateKey();
  const todayDay = cache.days[todayKey] ?? emptyDayAggregate(todayKey);

  const todayTotals = getFilteredBucket(
    todayDay.tokens,
    todayDay.calls,
    todayDay.byRole,
    todayDay.byAction,
    todayDay.byRoleAction,
    filters.role,
    filters.action
  );

  const todayByRole: Buckets =
    filters.action && !filters.role
      ? Object.fromEntries(
          ROLES.map((role) => [
            role,
            todayDay.byRoleAction[`${role}::${filters.action ?? ""}`] ?? emptyBucket(),
          ])
        )
      : todayDay.byRole;

  const todayByAction: Buckets =
    filters.role && !filters.action
      ? Object.fromEntries(
          Object.keys(todayDay.byAction).map((action) => [
            action,
            todayDay.byRoleAction[`${filters.role ?? ""}::${action}`] ?? emptyBucket(),
          ])
        )
      : todayDay.byAction;

  const topTasksToday = Object.values(todayDay.tasks)
    .map((task) => {
      const filtered = getFilteredBucket(
        task.tokens,
        task.calls,
        task.byRole,
        task.byAction,
        task.byRoleAction,
        filters.role,
        filters.action
      );
      return {
        taskId: task.taskId,
        tokens: filtered.tokens,
        calls: filtered.calls,
        byRole: sortBucketsDesc(task.byRole),
        byAction: sortBucketsDesc(task.byAction),
        byModel: sortBucketsDesc(task.byModel),
      };
    })
    .filter((task) => task.calls > 0)
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 10);

  const last7Days = getDateKeys("last7").map((date) => {
    const day = cache.days[date] ?? emptyDayAggregate(date);
    const filtered = getFilteredBucket(
      day.tokens,
      day.calls,
      day.byRole,
      day.byAction,
      day.byRoleAction,
      filters.role,
      filters.action
    );
    return {
      date,
      tokens: filtered.tokens,
      calls: filtered.calls,
    };
  });

  const selectedRangeDateKeys = getDateKeys(filters.range);
  const rangeDays = last7Days.filter((day) => selectedRangeDateKeys.includes(day.date));
  const rangeTokens = rangeDays.reduce((sum, day) => sum + day.tokens, 0);
  const estimatedCostUsd = Number(((rangeTokens / 1_000_000) * 5).toFixed(2));

  return {
    today: {
      tokens: todayTotals.tokens,
      calls: todayTotals.calls,
      estimatedCostUsd,
      byRole: sortBucketsDesc(todayByRole),
      byAction: sortBucketsDesc(todayByAction),
    },
    last7Days,
    topTasksToday,
    availableActions: Object.keys(todayDay.byAction).sort(),
  };
}
