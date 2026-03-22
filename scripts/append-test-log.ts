import fs from "fs";
import path from "path";

const logsDir = path.join(process.cwd(), "logs");
const logPath = path.join(logsDir, "ai_calls.jsonl");

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const promptTokens = Math.floor(400 + Math.random() * 900);
const completionTokens = Math.floor(700 + Math.random() * 1300);
const totalTokens = promptTokens + completionTokens;

const row = {
  ts: new Date().toISOString(),
  role: "architect",
  action: "test",
  channel_id: "local:manual",
  thread_ts: `${Date.now()}.manual`,
  task_id: "test:manual",
  model: "local-test-model",
  prompt_tokens: promptTokens,
  completion_tokens: completionTokens,
  total_tokens: totalTokens,
  latency_ms: Math.floor(300 + Math.random() * 1200),
  success: true,
  error_code: null,
  cache_hit: null,
};

fs.appendFileSync(logPath, `${JSON.stringify(row)}\n`, "utf-8");
console.log(`Appended test log line to ${logPath}`);
