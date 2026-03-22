import fs from "fs";
import path from "path";
import { appendAiCallLog } from "../lib/observability/append-log";
import type { BotConfig } from "./bot_configs";

const LOGS_DIR = path.join(process.cwd(), "logs");
const STATE_FILE = path.join(LOGS_DIR, "architect_runtime_state.json");
const BUDGET_FILE = path.join(LOGS_DIR, "budget_daily.json");

type RuntimeState = {
  processedEvents: Record<string, number>;
  lastThreadCallAtMs: Record<string, number>;
  activeThreads: Record<string, number>;
  pendingTaskByThread: Record<string, PendingTaskDraft>;
};

export type PendingTaskDraft = {
  id: string;
  title: string;
  owner: "engineer";
  priority: "high" | "med" | "low";
  status: "backlog";
  created_at: string;
  thread_ts: string;
  summary: string;
  context: string;
  scope: string[];
  definition_of_done: string[];
};

type BudgetFile = {
  architect: Record<string, { calls: number }>;
};

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function parseAllowedChannels(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function cleanMentionText(text: string): string {
  return text.replace(/<@[^>]+>/g, "").trim();
}

function ensureLogsDir(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function loadState(): RuntimeState {
  ensureLogsDir();
  if (!fs.existsSync(STATE_FILE)) {
    return {
      processedEvents: {},
      lastThreadCallAtMs: {},
      activeThreads: {},
      pendingTaskByThread: {},
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as RuntimeState;
    return {
      processedEvents: parsed.processedEvents ?? {},
      lastThreadCallAtMs: parsed.lastThreadCallAtMs ?? {},
      activeThreads: parsed.activeThreads ?? {},
      pendingTaskByThread: parsed.pendingTaskByThread ?? {},
    };
  } catch {
    return {
      processedEvents: {},
      lastThreadCallAtMs: {},
      activeThreads: {},
      pendingTaskByThread: {},
    };
  }
}

function saveState(state: RuntimeState): void {
  ensureLogsDir();
  const now = Date.now();
  const maxAgeMs = 3 * 24 * 60 * 60 * 1000;

  for (const [key, ts] of Object.entries(state.processedEvents)) {
    if (now - ts > maxAgeMs) delete state.processedEvents[key];
  }
  for (const [key, ts] of Object.entries(state.activeThreads)) {
    if (now - ts > maxAgeMs) delete state.activeThreads[key];
  }
  for (const [key, draft] of Object.entries(state.pendingTaskByThread)) {
    const createdAt = Date.parse(draft.created_at);
    if (!Number.isNaN(createdAt) && now - createdAt > maxAgeMs) {
      delete state.pendingTaskByThread[key];
    }
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

function loadBudget(): BudgetFile {
  ensureLogsDir();
  if (!fs.existsSync(BUDGET_FILE)) {
    return { architect: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(BUDGET_FILE, "utf-8")) as BudgetFile;
    return { architect: parsed.architect ?? {} };
  } catch {
    return { architect: {} };
  }
}

function saveBudget(budget: BudgetFile): void {
  ensureLogsDir();
  fs.writeFileSync(BUDGET_FILE, JSON.stringify(budget, null, 2), "utf-8");
}

export function isDuplicateEvent(eventKey: string): boolean {
  const state = loadState();
  if (state.processedEvents[eventKey]) return true;
  state.processedEvents[eventKey] = Date.now();
  saveState(state);
  return false;
}

export function isThreadCoolingDown(threadKey: string, cooldownMs: number): boolean {
  const state = loadState();
  const last = state.lastThreadCallAtMs[threadKey];
  if (last && Date.now() - last < cooldownMs) return true;
  state.lastThreadCallAtMs[threadKey] = Date.now();
  saveState(state);
  return false;
}

export function markThreadActive(threadKey: string): void {
  const state = loadState();
  state.activeThreads[threadKey] = Date.now();
  saveState(state);
}

export function isThreadActive(threadKey: string): boolean {
  const state = loadState();
  return Boolean(state.activeThreads[threadKey]);
}

export function setPendingTaskDraft(threadKey: string, draft: PendingTaskDraft): void {
  const state = loadState();
  state.pendingTaskByThread[threadKey] = draft;
  saveState(state);
}

export function getPendingTaskDraft(threadKey: string): PendingTaskDraft | null {
  const state = loadState();
  return state.pendingTaskByThread[threadKey] ?? null;
}

export function clearPendingTaskDraft(threadKey: string): void {
  const state = loadState();
  delete state.pendingTaskByThread[threadKey];
  saveState(state);
}

export function consumeDailyBudget(dailyCap: number): { ok: boolean; used: number; cap: number } {
  const budget = loadBudget();
  const day = new Date().toISOString().slice(0, 10);
  const row = budget.architect[day] ?? { calls: 0 };
  if (row.calls >= dailyCap) {
    return { ok: false, used: row.calls, cap: dailyCap };
  }
  row.calls += 1;
  budget.architect[day] = row;
  saveBudget(budget);
  return { ok: true, used: row.calls, cap: dailyCap };
}

type OpenRouterResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export async function callOpenRouter(params: {
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  systemPrompt: string;
  userText: string;
}): Promise<OpenRouterResult> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxOutputTokens,
      reasoning: { exclude: true },
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userText },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`openrouter_http_${response.status}:${body.slice(0, 240)}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{
      text?: string;
      message?: {
        content?: string | Array<{ text?: string }>;
        refusal?: string | null;
      };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  const content = json.choices?.[0]?.message?.content;
  const topLevelText = json.choices?.[0]?.text;
  const refusalText = json.choices?.[0]?.message?.refusal;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((part) => (typeof part?.text === "string" ? part.text : ""))
            .join("")
            .trim()
        : typeof topLevelText === "string"
          ? topLevelText
          : typeof refusalText === "string"
            ? refusalText
            : "";

  const promptTokens = json.usage?.prompt_tokens ?? 0;
  const completionTokens = json.usage?.completion_tokens ?? 0;
  const totalTokens = json.usage?.total_tokens ?? promptTokens + completionTokens;

  if (!text.trim()) {
    throw new Error("empty_content_from_model");
  }

  return { text: text.trim(), promptTokens, completionTokens, totalTokens };
}

export function appendArchitectUsage(params: {
  config: BotConfig;
  channelId: string;
  threadTs: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  success: boolean;
  errorCode: string | null;
}): void {
  appendAiCallLog({
    ts: new Date().toISOString(),
    role: "architect",
    action: params.config.action,
    channel_id: params.channelId,
    thread_ts: params.threadTs,
    task_id: `${params.channelId}:${params.threadTs}`,
    model: params.model,
    prompt_tokens: params.promptTokens,
    completion_tokens: params.completionTokens,
    total_tokens: params.totalTokens,
    latency_ms: params.latencyMs,
    success: params.success,
    error_code: params.errorCode,
    cache_hit: null,
  });
}

