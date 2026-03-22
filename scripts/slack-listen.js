#!/usr/bin/env node

const { App } = require("@slack/bolt");
const { enqueueMentionTask } = require("../src/lib/slack/task-queue");

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function getAllowedChannels() {
  const single = (process.env.DEV_SLACK_CHANNEL_ID || process.env.SLACK_CHANNEL_ID || "").trim();
  const csv = (process.env.DEV_SLACK_ALLOWED_CHANNELS || process.env.SLACK_ALLOWED_CHANNELS || "").trim();
  const fromCsv = csv
    ? csv
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const set = new Set(fromCsv);
  if (single) set.add(single);
  return set;
}

function cleanMentionText(text) {
  return text.replace(/<@[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function extractTaskFields(text) {
  const trelloMatch = text.match(/https?:\/\/trello\.com\/c\/[A-Za-z0-9]+[^\s]*/i);
  const repoMatch = text.match(/\brepo\s*[:=]\s*([^\s,;]+)/i);
  const branchMatch = text.match(/\bbranch\s*[:=]\s*([^\s,;]+)/i);
  const dodMatch = text.match(
    /\b(?:definition of done|dod|done when)\s*[:=]\s*([^.;\n]+(?:[.;][^.;\n]+)*)/i
  );
  const constraintsMatch = text.match(
    /\b(?:constraints?|rules?)\s*[:=]\s*([^.;\n]+(?:[.;][^.;\n]+)*)/i
  );

  let title = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\brepo\s*[:=]\s*[^\s,;]+/gi, "")
    .replace(/\bbranch\s*[:=]\s*[^\s,;]+/gi, "")
    .replace(/\b(?:definition of done|dod|done when)\s*[:=]\s*[^.;\n]+/gi, "")
    .replace(/\b(?:constraints?|rules?)\s*[:=]\s*[^.;\n]+/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[,.\-:;\s]+|[,.\-:;\s]+$/g, "");
  if (!title) title = "(missing)";
  if (title.length > 120) title = `${title.slice(0, 117)}...`;

  return {
    title,
    trelloLink: trelloMatch ? trelloMatch[0] : null,
    repo: repoMatch ? repoMatch[1] : null,
    branch: branchMatch ? branchMatch[1] : null,
    definitionOfDone: dodMatch ? dodMatch[1].trim() : null,
    constraints: constraintsMatch ? constraintsMatch[1].trim() : null,
  };
}

function buildTaskReply(incoming) {
  const fields = extractTaskFields(incoming);
  const missing = [];
  if (!fields.trelloLink) missing.push("Trello card link");
  if (!fields.repo) missing.push("repo");
  if (!fields.branch) missing.push("branch");
  if (!fields.definitionOfDone) missing.push("definition of done");
  if (!fields.constraints) missing.push("constraints");

  const lines = [
    "Claimed. Starting analysis.",
    "",
    "Task intake:",
    `- Title: ${fields.title}`,
    `- Trello: ${fields.trelloLink ?? "(missing)"}`,
    `- Repo: ${fields.repo ?? "(missing)"}`,
    `- Branch: ${fields.branch ?? "(missing)"}`,
    `- Definition of done: ${fields.definitionOfDone ?? "(missing)"}`,
    `- Constraints: ${fields.constraints ?? "(missing)"}`,
  ];

  if (missing.length > 0) {
    lines.push("");
    lines.push("Need clarification before implementation:");
    for (const item of missing) {
      lines.push(`- Please provide ${item}.`);
    }
  } else {
    lines.push("");
    lines.push("All required details captured. I will proceed with plan and implementation updates.");
  }

  return lines.join("\n");
}

async function main() {
  const botToken = requireEnv("DEV_SLACK_BOT_TOKEN");
  const appToken = requireEnv("DEV_SLACK_APP_TOKEN");
  const allowedChannels = getAllowedChannels();

  const app = new App({
    token: botToken,
    appToken,
    socketMode: true,
  });

  app.event("app_mention", async ({ event, say }) => {
    if (event.bot_id || event.subtype === "bot_message") return;
    if (allowedChannels.size > 0 && !allowedChannels.has(event.channel)) {
      return;
    }

    const incoming = cleanMentionText(event.text || "");
    if (!incoming) {
      await say({
        text: "Please include a task after mention. Example: title + Trello link + repo + branch + definition of done + constraints.",
        thread_ts: event.thread_ts || event.ts,
      });
      return;
    }

    const fields = extractTaskFields(incoming);
    const missing = [];
    if (!fields.trelloLink) missing.push("Trello card link");
    if (!fields.repo) missing.push("repo");
    if (!fields.branch) missing.push("branch");
    if (!fields.definitionOfDone) missing.push("definition of done");
    if (!fields.constraints) missing.push("constraints");

    const queueResult = enqueueMentionTask({
      eventKey: `${event.channel}:${event.ts}`,
      channelId: event.channel,
      threadTs: event.thread_ts || event.ts,
      requesterUserId: event.user || "unknown-user",
      text: incoming,
    });

    const replyLines = [
      "Claimed. Starting analysis.",
      "",
      "Task intake:",
      `- Title: ${fields.title}`,
      `- Trello: ${fields.trelloLink ?? "(missing)"}`,
      `- Repo: ${fields.repo ?? "(missing)"}`,
      `- Branch: ${fields.branch ?? "(missing)"}`,
      `- Definition of done: ${fields.definitionOfDone ?? "(missing)"}`,
      `- Constraints: ${fields.constraints ?? "(missing)"}`,
      "",
      `Queued for autonomous execution: ${queueResult.task.id}`,
    ];

    if (missing.length > 0) {
      replyLines.push("");
      replyLines.push("Missing details (worker may be blocked depending on task type):");
      for (const item of missing) {
        replyLines.push(`- Please provide ${item}.`);
      }
    }

    await say({
      text: replyLines.join("\n"),
      thread_ts: event.thread_ts || event.ts,
    });
  });

  await app.start();
  const channelInfo =
    allowedChannels.size > 0 ? Array.from(allowedChannels).join(",") : "(all channels)";
  console.log(`[slack-listen] Socket Mode listener started. allowed_channels=${channelInfo}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[slack-listen] Failed: ${message}`);
  process.exit(1);
});
