#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { createSlackPoster } = require("../src/lib/slack/poster");
const {
  claimNextPendingTask,
  completeTask,
  failTask,
} = require("../src/lib/slack/task-queue");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanTaskText(text) {
  return text.replace(/\*Sent using\* Cursor/gi, "").replace(/\s+/g, " ").trim();
}

function isReadmeUpdateRequest(text) {
  const lower = text.toLowerCase();
  return (
    lower.includes("update readme") ||
    lower.includes("update readme file") ||
    lower.includes("update project readme")
  );
}

async function appendReadmeUpdateEntry(params) {
  const readmePath = path.join(process.cwd(), "README.md");
  const now = new Date().toISOString();
  const sectionHeader = "## Slack Task Updates (Automated)";
  const entry = `- ${now} - ${params.requester}: ${params.taskText}`;

  let current = "";
  try {
    current = await fs.readFile(readmePath, "utf8");
  } catch {
    throw new Error("Could not read README.md.");
  }

  const next = current.includes(sectionHeader)
    ? `${current}\n${entry}\n`
    : `${current}\n\n${sectionHeader}\n\n${entry}\n`;
  await fs.writeFile(readmePath, next, "utf8");
}

async function updateTaskJsonStatus(taskId, status) {
  if (!taskId) return;
  const tasksPath = path.join(process.cwd(), "tasks", "tasks.json");
  let raw = "[]";
  try {
    raw = await fs.readFile(tasksPath, "utf8");
  } catch {
    return;
  }
  let tasks;
  try {
    tasks = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(tasks)) return;
  const index = tasks.findIndex((task) => task && task.id === taskId);
  if (index === -1) return;
  tasks[index] = { ...tasks[index], status };
  await fs.writeFile(tasksPath, JSON.stringify(tasks, null, 2), "utf8");
}

async function postThreadReply(poster, task, text) {
  await poster.postMessage({
    channelId: task.channelId,
    threadTs: task.threadTs,
    text,
  });
}

function parseBacklogTaskMeta(line) {
  const titleMatch = line.match(/^- \[ \]\s*(.+?)(?:\s+\(id:|\s*$)/);
  const idMatch = line.match(/\(id:\s*([^,\s)]+)/i);
  const priorityMatch = line.match(/priority:\s*([a-z]+)/i);
  return {
    title: (titleMatch?.[1] ?? "").trim(),
    id: (idMatch?.[1] ?? "").trim() || null,
    priority: (priorityMatch?.[1] ?? "").trim() || null,
  };
}

async function claimOldestBacklogTodo() {
  const backlogPath = path.join(process.cwd(), "brain", "BACKLOG.md");
  const raw = await fs.readFile(backlogPath, "utf8");
  const lines = raw.split("\n");

  const todoHeader = lines.findIndex((line) => line.trim() === "## To Do");
  const inProgressHeader = lines.findIndex((line) => line.trim() === "## In Progress");
  const doneHeader = lines.findIndex((line) => line.trim() === "## Done");
  if (todoHeader === -1 || inProgressHeader === -1 || doneHeader === -1) return null;

  const todoStart = todoHeader + 1;
  const todoEnd = inProgressHeader;
  const inProgressInsertAt = inProgressHeader + 1;
  let targetIndex = -1;
  for (let i = todoStart; i < todoEnd; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("- [ ]")) continue;
    const title = trimmed.replace(/^- \[ \]\s*/, "").trim();
    if (!title) continue;
    targetIndex = i;
    break;
  }

  if (targetIndex === -1) return null;
  const claimedLine = lines[targetIndex];
  const meta = parseBacklogTaskMeta(claimedLine.trim());
  lines.splice(targetIndex, 1);
  lines.splice(inProgressInsertAt - 1, 0, claimedLine);
  await fs.writeFile(backlogPath, lines.join("\n"), "utf8");
  await updateTaskJsonStatus(meta.id, "in_progress");

  return {
    type: "backlog",
    title: meta.title || claimedLine.replace(/^- \[ \]\s*/, "").trim(),
    id: meta.id,
    priority: meta.priority,
    line: claimedLine,
    backlogPath,
  };
}

async function markBacklogDone(claimed) {
  const raw = await fs.readFile(claimed.backlogPath, "utf8");
  const lines = raw.split("\n");
  const doneHeader = lines.findIndex((line) => line.trim() === "## Done");
  const inProgressHeader = lines.findIndex((line) => line.trim() === "## In Progress");
  if (doneHeader === -1 || inProgressHeader === -1) return;

  const inProgressEnd = doneHeader;
  let targetIndex = -1;
  for (let i = inProgressHeader + 1; i < inProgressEnd; i += 1) {
    const line = lines[i];
    if (claimed.id && line.includes(`id: ${claimed.id}`)) {
      targetIndex = i;
      break;
    }
    if (!claimed.id && line.trim() === claimed.line.trim()) {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex === -1) return;

  const doneLine = lines[targetIndex].replace(/^- \[ \]/, "- [x]");
  lines.splice(targetIndex, 1);
  lines.splice(doneHeader + 1, 0, doneLine);
  await fs.writeFile(claimed.backlogPath, lines.join("\n"), "utf8");
  await updateTaskJsonStatus(claimed.id, "done");
}

async function generateModelExecutionNote(taskText) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const model =
    process.env.ENGINEER_MODEL ??
    process.env.OPENROUTER_MODEL ??
    "meta-llama/llama-3.1-8b-instruct:free";
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 220,
      reasoning: { exclude: true },
      messages: [
        {
          role: "system",
          content:
            "You are a pragmatic engineer agent. Produce a concise execution note with concrete code action and verification in 2-4 lines.",
        },
        {
          role: "user",
          content: `Task: ${taskText}`,
        },
      ],
    }),
  });
  if (!response.ok) return null;
  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  return null;
}

async function executeBacklogTask(claimed, poster) {
  const claimPost = await poster.postMessage({
    text: [
      "Claimed. Starting implementation.",
      `- Source: BACKLOG.md oldest To Do`,
      `- Task: ${claimed.title}`,
      claimed.id ? `- Task ID: ${claimed.id}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  const threadTs = claimPost.ts;
  const text = cleanTaskText(claimed.title);

  if (isReadmeUpdateRequest(text)) {
    await appendReadmeUpdateEntry({
      requester: "dev-agent",
      taskText: text,
    });
    await markBacklogDone(claimed);
    await poster.postMessage({
      threadTs,
      text: [
        "Execution complete.",
        "- Action: update README.md",
        "- Backlog transition: To Do -> In Progress -> Done",
        "- Files changed: README.md, brain/BACKLOG.md",
      ].join("\n"),
    });
    return;
  }

  const note = await generateModelExecutionNote(text);
  await poster.postMessage({
    threadTs,
    text: [
      "Execution blocked: unsupported autonomous code action for this task type.",
      note ? `Model note:\n${note}` : null,
      "Current support: tasks requesting README updates.",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
}

async function executeTask(task, poster) {
  const text = cleanTaskText(task.text || "");

  if (isReadmeUpdateRequest(text)) {
    await appendReadmeUpdateEntry({
      requester: task.requesterUserId || "unknown-user",
      taskText: text,
    });
    const result = {
      action: "update_readme",
      filesChanged: ["README.md"],
    };
    completeTask(task.id, result);
    await postThreadReply(
      poster,
      task,
      [
        "Execution complete.",
        "- Action: update README.md",
        "- Files changed: README.md",
        "- Verification: README now contains a new entry under `## Slack Task Updates (Automated)`",
      ].join("\n")
    );
    return;
  }

  const unsupported =
    "Execution blocked: unsupported task type for autonomous worker. Supported now: update README file.";
  failTask(task.id, unsupported);
  await postThreadReply(poster, task, unsupported);
}

async function main() {
  const pollMsRaw = Number(process.env.SLACK_WORKER_POLL_MS ?? 2500);
  const pollMs = Number.isFinite(pollMsRaw) ? Math.max(500, pollMsRaw) : 2500;
  const fallbackArchitectChannel = (process.env.ARCHITECT_ALLOWED_CHANNELS || "")
    .split(",")[0]
    ?.trim();

  const poster = createSlackPoster({
    token: process.env.DEV_SLACK_BOT_TOKEN,
    appToken: process.env.DEV_SLACK_APP_TOKEN,
    defaultChannelId:
      process.env.DEV_SLACK_CHANNEL_ID ??
      process.env.SLACK_CHANNEL_ID ??
      fallbackArchitectChannel,
  });

  let running = true;
  process.on("SIGINT", () => {
    running = false;
  });
  process.on("SIGTERM", () => {
    running = false;
  });

  console.log(`[slack-worker] Started. poll_ms=${pollMs}`);
  while (running) {
    const queueTask = claimNextPendingTask();
    if (queueTask) {
      try {
        await executeTask(queueTask, poster);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown worker error";
        failTask(queueTask.id, message);
        try {
          await postThreadReply(
            poster,
            queueTask,
            `Execution failed: ${message}\nPlease check worker logs and retry.`
          );
        } catch {
          // Ignore secondary reporting failure.
        }
      }
      continue;
    }

    try {
      const claimedBacklog = await claimOldestBacklogTodo();
      if (claimedBacklog) {
        await executeBacklogTask(claimedBacklog, poster);
        continue;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown backlog worker error";
      console.error(`[slack-worker] Backlog polling error: ${message}`);
    }

    await sleep(pollMs);
  }

  console.log("[slack-worker] Stopped.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[slack-worker] Failed: ${message}`);
  process.exit(1);
});
