import fs from "fs";
import path from "path";

export type AiCallLogLine = {
  ts: string;
  role: "architect" | "engineer" | "reviewer";
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

const LOGS_DIR = path.join(process.cwd(), "logs");
const CALLS_LOG_PATH = path.join(LOGS_DIR, "ai_calls.jsonl");

export function appendAiCallLog(line: AiCallLogLine): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
  fs.appendFileSync(CALLS_LOG_PATH, `${JSON.stringify(line)}\n`, "utf-8");
}

