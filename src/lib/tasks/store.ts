import fs from "fs";
import path from "path";
import { ensureBrainExists, readBrainFile, writeBrainFile } from "../brain";

export type TaskRecord = {
  id: string;
  title: string;
  owner: "engineer";
  priority: "high" | "med" | "low";
  status: "backlog";
  created_at: string;
  thread_ts: string;
  summary: string;
};

const TASKS_DIR = path.join(process.cwd(), "tasks");
const TASKS_FILE = path.join(TASKS_DIR, "tasks.json");
const BACKLOG_FILE = "BACKLOG.md";

function ensureTaskStorage(): void {
  if (!fs.existsSync(TASKS_DIR)) {
    fs.mkdirSync(TASKS_DIR, { recursive: true });
  }
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, "[]", "utf-8");
  }
}

function readTasks(): TaskRecord[] {
  ensureTaskStorage();
  try {
    const raw = fs.readFileSync(TASKS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as TaskRecord[];
  } catch {
    return [];
  }
}

function toSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function appendTaskToBacklog(task: TaskRecord): void {
  ensureBrainExists();
  const backlog = readBrainFile(BACKLOG_FILE);
  const taskMarker = `id: ${task.id}`;
  if (backlog.includes(taskMarker)) {
    return;
  }

  const todoHeader = "## To Do";
  const inProgressHeader = "## In Progress";
  const doneHeader = "## Done";
  const todoIndex = backlog.indexOf(todoHeader);
  const inProgressIndex = backlog.indexOf(inProgressHeader);
  const doneIndex = backlog.indexOf(doneHeader);
  const targetEnd = [inProgressIndex, doneIndex]
    .filter((index) => index > -1)
    .sort((a, b) => a - b)[0];
  const line = `- [ ] ${toSingleLine(task.title)} (id: ${task.id}, priority: ${task.priority})`;

  if (todoIndex === -1) {
    const section = `\n## To Do\n${line}\n`;
    writeBrainFile(BACKLOG_FILE, `${backlog.trimEnd()}\n${section}\n`);
    return;
  }

  const insertIndex = typeof targetEnd === "number" ? targetEnd : backlog.length;
  const before = backlog.slice(0, insertIndex).replace(/\s*$/, "\n");
  const after = backlog.slice(insertIndex).replace(/^\s*/, "\n");
  writeBrainFile(BACKLOG_FILE, `${before}${line}\n${after}`);
}

export function appendTask(task: TaskRecord): void {
  const tasks = readTasks();
  tasks.push(task);
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), "utf-8");
  appendTaskToBacklog(task);
}

