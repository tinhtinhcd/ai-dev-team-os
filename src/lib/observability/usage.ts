import fs from "fs";
import path from "path";

export type CallRole = "architect" | "engineer" | "reviewer";
export type DateRange = "today" | "last7";

type Bucket = { tokens: number; calls: number };
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

type IngestedLog = {
  ts: string;
  role: CallRole;
  action: string;
  task_id: string;
  model: string;
  total_tokens: number;
  success: boolean;
  channel_id: string | null;
  thread_ts: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  latency_ms: number | null;
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
  last7Days: Array<{ date: string; tokens: number; calls: number }>;
  topTasksToday: TopTask[];
  availableActions: string[];
  logState: "ready" | "missing_prod";
};

const LOGS_DIR = path.join(process.cwd(), "logs");
const CALLS_LOG_PATH = path.join(LOGS_DIR, "ai_calls.jsonl");
const CACHE_PATH = path.join(LOGS_DIR, "usage_cache.json");
const CACHE_VERSION = 2;
const ROLES: CallRole[] = ["architect", "engineer", "reviewer"];

function ensureLogsDirectory(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function maybeSeedDevLogs(): void {
  if (process.env.NODE_ENV !== "development") return;
  const now = Date.now();
  const seed = [
    {
      ts: new Date(now - 30 * 60 * 1000).toISOString(),
      role: "architect",
      action: "plan_task",
      channel_id: "C-ARCH",
      thread_ts: "seed.1",
      task_id: "seed:plan",
      model: "gpt-4.1",
      prompt_tokens: 800,
      completion_tokens: 1200,
      total_tokens: 2000,
      latency_ms: 640,
      success: true,
      error_code: null,
      cache_hit: null,
    },
    {
      ts: new Date(now - 20 * 60 * 1000).toISOString(),
      role: "engineer",
      action: "implement_task",
      channel_id: "C-ENG",
      thread_ts: "seed.2",
      task_id: "seed:impl",
      model: "gpt-4o-mini",
      prompt_tokens: 900,
      completion_tokens: 1700,
      total_tokens: 2600,
      latency_ms: 820,
      success: true,
      error_code: null,
      cache_hit: false,
    },
    {
      ts: new Date(now - 10 * 60 * 1000).toISOString(),
      role: "reviewer",
      action: "review_pr",
      channel_id: "C-REV",
      thread_ts: "seed.3",
      task_id: "seed:review",
      model: "claude-sonnet",
      prompt_tokens: 600,
      completion_tokens: 900,
      total_tokens: 1500,
      latency_ms: 560,
      success: true,
      error_code: null,
      cache_hit: true,
    },
  ];
  fs.writeFileSync(
    CALLS_LOG_PATH,
    `${seed.map((row) => JSON.stringify(row)).join("\n")}\n`,
    "utf-8"
  );
}

function ensureLogSource(): { state: "ready" | "missing_prod" } {
  ensureLogsDirectory();
  if (fs.existsSync(CALLS_LOG_PATH)) return { state: "ready" };
  if (process.env.NODE_ENV === "development") {
    maybeSeedDevLogs();
    if (!fs.existsSync(CALLS_LOG_PATH)) {
      fs.writeFileSync(CALLS_LOG_PATH, "", "utf-8");
    }
    return { state: "ready" };
  }
  return { state: "missing_prod" };
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
  if (!buckets[key]) buckets[key] = emptyBucket();
  buckets[key].tokens += tokens;
  buckets[key].calls += 1;
}

function toUtcDay(ts: string): string | null {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function normalizeOptionalBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseLine(line: string): IngestedLog | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>;
    const ts = parsed.ts;
    const role = parsed.role;
    const totalTokens = parsed.total_tokens;
    const success = parsed.success;

    if (
      typeof ts !== "string" ||
      typeof role !== "string" ||
      !ROLES.includes(role as CallRole) ||
      typeof totalTokens !== "number" ||
      typeof success !== "boolean"
    ) {
      return null;
    }

    if (!toUtcDay(ts)) return null;

    return {
      ts,
      role: role as CallRole,
      total_tokens: totalTokens,
      success,
      action: typeof parsed.action === "string" ? parsed.action : "unknown",
      task_id: typeof parsed.task_id === "string" ? parsed.task_id : "unknown",
      model: typeof parsed.model === "string" ? parsed.model : "unknown",
      channel_id: normalizeOptionalString(parsed.channel_id),
      thread_ts: normalizeOptionalString(parsed.thread_ts),
      prompt_tokens: normalizeOptionalNumber(parsed.prompt_tokens),
      completion_tokens: normalizeOptionalNumber(parsed.completion_tokens),
      latency_ms: normalizeOptionalNumber(parsed.latency_ms),
      error_code: normalizeOptionalString(parsed.error_code),
      cache_hit: normalizeOptionalBoolean(parsed.cache_hit),
    };
  } catch {
    return null;
  }
}

function loadCache(): UsageCache {
  if (!fs.existsSync(CACHE_PATH)) {
    return { version: CACHE_VERSION, lastProcessedByteOffset: 0, pendingLine: "", days: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as UsageCache;
    if (
      parsed.version !== CACHE_VERSION ||
      typeof parsed.lastProcessedByteOffset !== "number" ||
      typeof parsed.pendingLine !== "string" ||
      !parsed.days ||
      typeof parsed.days !== "object"
    ) {
      throw new Error("bad cache");
    }
    return parsed;
  } catch {
    return { version: CACHE_VERSION, lastProcessedByteOffset: 0, pendingLine: "", days: {} };
  }
}

function persistCache(cache: UsageCache): void {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

function readBytesFromOffset(filePath: string, offset: number): { text: string; size: number } {
  const stats = fs.statSync(filePath);
  const size = stats.size;
  if (size <= offset) return { text: "", size };

  const fd = fs.openSync(filePath, "r");
  try {
    const length = size - offset;
    const buffer = Buffer.alloc(length);
    const bytesRead = fs.readSync(fd, buffer, 0, length, offset);
    return { text: buffer.toString("utf-8", 0, bytesRead), size };
  } finally {
    fs.closeSync(fd);
  }
}

function ingestLog(cache: UsageCache, log: IngestedLog): void {
  const dayKey = toUtcDay(log.ts);
  if (!dayKey) return;

  if (!cache.days[dayKey]) cache.days[dayKey] = emptyDayAggregate(dayKey);
  const day = cache.days[dayKey];
  const roleActionKey = `${log.role}::${log.action}`;

  day.tokens += log.total_tokens;
  day.calls += 1;
  addToBuckets(day.byRole, log.role, log.total_tokens);
  addToBuckets(day.byAction, log.action, log.total_tokens);
  addToBuckets(day.byRoleAction, roleActionKey, log.total_tokens);

  if (!day.tasks[log.task_id]) day.tasks[log.task_id] = emptyTaskAggregate(log.task_id);
  const task = day.tasks[log.task_id];
  task.tokens += log.total_tokens;
  task.calls += 1;
  addToBuckets(task.byRole, log.role, log.total_tokens);
  addToBuckets(task.byAction, log.action, log.total_tokens);
  addToBuckets(task.byModel, log.model, log.total_tokens);
  addToBuckets(task.byRoleAction, roleActionKey, log.total_tokens);
}

function syncUsageCache(logState: "ready" | "missing_prod"): UsageCache {
  if (logState === "missing_prod") {
    return { version: CACHE_VERSION, lastProcessedByteOffset: 0, pendingLine: "", days: {} };
  }

  let cache = loadCache();
  const fileSize = fs.statSync(CALLS_LOG_PATH).size;
  if (fileSize < cache.lastProcessedByteOffset) {
    cache = { version: CACHE_VERSION, lastProcessedByteOffset: 0, pendingLine: "", days: {} };
  }

  const { text, size } = readBytesFromOffset(CALLS_LOG_PATH, cache.lastProcessedByteOffset);
  if (!text && size === cache.lastProcessedByteOffset) return cache;

  const combined = `${cache.pendingLine}${text}`;
  const lines = combined.split(/\r?\n/);
  cache.pendingLine = lines.pop() ?? "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
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
  if (range === "today") return [getTodayUtcDateKey()];
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
  if (role && action) return byRoleAction[`${role}::${action}`] ?? emptyBucket();
  if (role) return byRole[role] ?? emptyBucket();
  if (action) return byAction[action] ?? emptyBucket();
  return { tokens, calls };
}

function sortBucketsDesc(buckets: Buckets): Buckets {
  return Object.fromEntries(Object.entries(buckets).sort((a, b) => b[1].tokens - a[1].tokens));
}

export function getObservabilityData(filters: UsageFilters): ObservabilityData {
  const source = ensureLogSource();
  const cache = syncUsageCache(source.state);
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

  const todayByRole =
    filters.action && !filters.role
      ? Object.fromEntries(
          ROLES.map((role) => [
            role,
            todayDay.byRoleAction[`${role}::${filters.action ?? ""}`] ?? emptyBucket(),
          ])
        )
      : todayDay.byRole;

  const todayByAction =
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
    return { date, tokens: filtered.tokens, calls: filtered.calls };
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
    logState: source.state,
  };
}
