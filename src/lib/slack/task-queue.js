const fs = require("node:fs");
const path = require("node:path");

const TASKS_DIR = path.join(process.cwd(), "tasks");
const QUEUE_FILE = path.join(TASKS_DIR, "slack_inbox.json");

function ensureQueueStorage() {
  if (!fs.existsSync(TASKS_DIR)) {
    fs.mkdirSync(TASKS_DIR, { recursive: true });
  }
  if (!fs.existsSync(QUEUE_FILE)) {
    fs.writeFileSync(QUEUE_FILE, "[]", "utf8");
  }
}

function readQueue() {
  ensureQueueStorage();
  try {
    const raw = fs.readFileSync(QUEUE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  ensureQueueStorage();
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), "utf8");
}

function enqueueMentionTask(taskInput) {
  const queue = readQueue();
  const existing = queue.find((item) => item.eventKey === taskInput.eventKey);
  if (existing) {
    return { created: false, task: existing };
  }

  const task = {
    id: `slack_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    eventKey: taskInput.eventKey,
    channelId: taskInput.channelId,
    threadTs: taskInput.threadTs,
    requesterUserId: taskInput.requesterUserId,
    text: taskInput.text,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
    lastError: null,
    result: null,
  };

  queue.push(task);
  writeQueue(queue);
  return { created: true, task };
}

function claimNextPendingTask() {
  const queue = readQueue();
  const index = queue.findIndex((item) => item.status === "pending");
  if (index === -1) return null;

  const task = queue[index];
  const claimed = {
    ...task,
    status: "processing",
    attempts: Number(task.attempts || 0) + 1,
    startedAt: new Date().toISOString(),
  };
  queue[index] = claimed;
  writeQueue(queue);
  return claimed;
}

function completeTask(taskId, result) {
  const queue = readQueue();
  const index = queue.findIndex((item) => item.id === taskId);
  if (index === -1) return;
  queue[index] = {
    ...queue[index],
    status: "done",
    completedAt: new Date().toISOString(),
    result,
    lastError: null,
  };
  writeQueue(queue);
}

function failTask(taskId, errorMessage) {
  const queue = readQueue();
  const index = queue.findIndex((item) => item.id === taskId);
  if (index === -1) return;
  queue[index] = {
    ...queue[index],
    status: "failed",
    failedAt: new Date().toISOString(),
    lastError: errorMessage,
  };
  writeQueue(queue);
}

module.exports = {
  QUEUE_FILE,
  enqueueMentionTask,
  claimNextPendingTask,
  completeTask,
  failTask,
};
