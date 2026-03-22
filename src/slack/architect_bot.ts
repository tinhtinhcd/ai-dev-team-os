import { App } from "@slack/bolt";
import { appendTask } from "../lib/tasks/store";
import { ARCHITECT_CONFIG } from "./bot_configs";
import {
  type PendingTaskDraft,
  appendArchitectUsage,
  callOpenRouter,
  cleanMentionText,
  clearPendingTaskDraft,
  consumeDailyBudget,
  getPendingTaskDraft,
  isDuplicateEvent,
  isThreadActive,
  isThreadCoolingDown,
  markThreadActive,
  parseAllowedChannels,
  requireEnv,
  setPendingTaskDraft,
} from "./framework";

const ARCHITECT_MODEL =
  process.env.ARCHITECT_MODEL ??
  process.env.OPENROUTER_MODEL ??
  "meta-llama/llama-3.1-8b-instruct:free";
const MAX_OUTPUT_TOKENS = Number(process.env.MAX_OUTPUT_TOKENS ?? 600);
const THREAD_COOLDOWN_SECONDS = Number(
  process.env.ARCHITECT_THREAD_COOLDOWN_SECONDS ?? 600
);
const THREAD_COOLDOWN_MS = Math.max(
  0,
  (Number.isFinite(THREAD_COOLDOWN_SECONDS) ? THREAD_COOLDOWN_SECONDS : 600) * 1000
);
const DAILY_CALL_CAP = Number(process.env.ARCHITECT_DAILY_CALL_CAP ?? 120);
const ARCHITECT_ALLOW_DM = (process.env.ARCHITECT_ALLOW_DM ?? "false") === "true";
const MAX_THREAD_HISTORY_MESSAGES = Number(
  process.env.ARCHITECT_MAX_THREAD_HISTORY_MESSAGES ?? 20
);

type MentionEvent = {
  channel: string;
  text?: string;
  thread_ts?: string;
  ts: string;
  channel_type?: string;
  bot_id?: string;
  subtype?: string;
};

type ThreadMessage = {
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  subtype?: string;
};

const TASK_INTENT_PHRASES = [
  "we need",
  "let's build",
  "create",
  "design",
  "implement",
  "system",
  "feature",
];

function isBotEvent(event: MentionEvent): boolean {
  return Boolean(event.bot_id || event.subtype === "bot_message");
}

function hasTaskIntent(text: string): boolean {
  const lower = text.toLowerCase();
  return TASK_INTENT_PHRASES.some((phrase) => lower.includes(phrase));
}

function isAffirmative(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return ["yes", "y", "ok", "okay", "confirm", "go ahead", "do it"].includes(lower);
}

function isNegative(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return ["no", "n", "cancel", "stop", "not now"].includes(lower);
}

function inferPriority(text: string): "high" | "med" | "low" {
  const lower = text.toLowerCase();
  if (/(urgent|asap|critical|blocker|immediately)/.test(lower)) return "high";
  if (/(later|nice to have|optional|someday)/.test(lower)) return "low";
  return "med";
}

function makeTaskTitle(text: string): string {
  const cleaned = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.?!]+$/, "");
  if (!cleaned) return "Define implementation task";
  const capped = cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

function buildTaskDraft(params: {
  channelId: string;
  threadTs: string;
  userText: string;
  threadContext: string;
}): PendingTaskDraft {
  const now = new Date().toISOString();
  const id = `task_${Date.now()}`;
  const title = makeTaskTitle(params.userText);
  const priority = inferPriority(params.userText);
  const context = params.threadContext
    ? `Requested in thread ${params.channelId}:${params.threadTs}. Continue from ongoing discussion context.`
    : "Requested by Architect discussion; convert this direction into executable implementation work.";

  return {
    id,
    title,
    owner: "engineer",
    priority,
    status: "backlog",
    created_at: now,
    thread_ts: params.threadTs,
    summary: params.userText,
    context,
    scope: [
      "Define implementation approach and interfaces",
      "Implement minimal working version",
      "Add validation/tests for core flow",
    ],
    definition_of_done: [
      "Core implementation completed",
      "Behavior validated with local test",
      "Task/result documented for handoff",
    ],
  };
}

function formatTaskBlock(task: PendingTaskDraft): string {
  return [
    "📌 TASK CREATED",
    `Title: ${task.title}`,
    `Owner: ${task.owner}`,
    `Priority: ${task.priority}`,
    `Status: ${task.status}`,
    "",
    "Context:",
    task.context,
    "",
    "Scope:",
    ...task.scope.map((item) => `- ${item}`),
    "",
    "Definition of Done:",
    ...task.definition_of_done.map((item) => `- [ ] ${item}`),
  ].join("\n");
}

async function buildThreadContext(params: {
  app: App;
  botToken: string;
  channel: string;
  threadTs: string;
  currentEventTs: string;
}): Promise<string> {
  const history = await params.app.client.conversations.replies({
    token: params.botToken,
    channel: params.channel,
    ts: params.threadTs,
    limit: Math.max(1, Math.min(MAX_THREAD_HISTORY_MESSAGES, 50)),
    inclusive: true,
  });

  const messages = (history.messages ?? []) as ThreadMessage[];
  const sorted = messages
    .filter((msg) => typeof msg.ts === "string" && msg.ts <= params.currentEventTs)
    .sort((a, b) => (a.ts ?? "").localeCompare(b.ts ?? ""))
    .slice(-Math.max(1, Math.min(MAX_THREAD_HISTORY_MESSAGES, 50)));

  const lines = sorted
    .map((msg) => {
      const role = msg.bot_id ? "assistant" : "user";
      const text = (msg.text ?? "").trim();
      if (!text) return null;
      return `[${role}] ${text}`;
    })
    .filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

async function maybeHandleTaskFlow(params: {
  conversationKey: string;
  threadTs: string;
  channelId: string;
  userText: string;
  threadContext: string;
  reply: (text: string) => Promise<void>;
}): Promise<boolean> {
  const pending = getPendingTaskDraft(params.conversationKey);
  if (pending) {
    if (isAffirmative(params.userText)) {
      appendTask({
        id: pending.id,
        title: pending.title,
        owner: pending.owner,
        priority: pending.priority,
        status: pending.status,
        created_at: pending.created_at,
        thread_ts: pending.thread_ts,
        summary: pending.summary,
      });
      clearPendingTaskDraft(params.conversationKey);
      await params.reply("Task added to backlog");
      return true;
    }
    if (isNegative(params.userText)) {
      clearPendingTaskDraft(params.conversationKey);
      await params.reply("Okay, task not created.");
      return true;
    }
  }

  if (!hasTaskIntent(params.userText)) {
    return false;
  }

  const draft = buildTaskDraft({
    channelId: params.channelId,
    threadTs: params.threadTs,
    userText: params.userText,
    threadContext: params.threadContext,
  });
  setPendingTaskDraft(params.conversationKey, draft);
  await params.reply(`${formatTaskBlock(draft)}\n\nCreate this task?`);
  return true;
}

async function main(): Promise<void> {
  const botToken = requireEnv("ARCHITECT_SLACK_BOT_TOKEN");
  const appToken = requireEnv("ARCHITECT_SLACK_APP_TOKEN");
  const apiKey = requireEnv("OPENROUTER_API_KEY");
  const allowedChannels = parseAllowedChannels(requireEnv("ARCHITECT_ALLOWED_CHANNELS"));

  const app = new App({
    token: botToken,
    appToken,
    socketMode: true,
  });

  app.event("app_mention", async ({ event, body, say }) => {
    const mention = event as MentionEvent;
    if (isBotEvent(mention)) return;
    if (!allowedChannels.has(mention.channel)) return;

    const eventId = typeof body.event_id === "string" ? body.event_id : "missing_event_id";
    const dedupeKey = `${eventId}:${mention.ts}`;
    if (isDuplicateEvent(dedupeKey)) return;

    const threadTs = mention.thread_ts ?? mention.ts;
    const threadKey = `${mention.channel}:${threadTs}`;
    markThreadActive(threadKey);

    const userText = cleanMentionText(mention.text ?? "");
    if (!userText) {
      await say({
        text: "Please include your request after mentioning me.",
        thread_ts: threadTs,
      });
      return;
    }

    let threadContext = "";
    try {
      threadContext = await buildThreadContext({
        app,
        botToken,
        channel: mention.channel,
        threadTs,
        currentEventTs: mention.ts,
      });
    } catch {
      // If thread fetch fails (permissions/transient), continue with current message only.
      threadContext = "";
    }

    const replyInThread = async (text: string): Promise<void> => {
      await say({
        text,
        thread_ts: threadTs,
      });
    };

    if (
      await maybeHandleTaskFlow({
        conversationKey: threadKey,
        threadTs,
        channelId: mention.channel,
        userText,
        threadContext,
        reply: replyInThread,
      })
    ) {
      return;
    }

    if (isThreadCoolingDown(threadKey, THREAD_COOLDOWN_MS)) {
      await replyInThread(
        "Cooldown active for this thread. Please wait before the next Architect request."
      );
      appendArchitectUsage({
        config: ARCHITECT_CONFIG,
        channelId: mention.channel,
        threadTs,
        model: ARCHITECT_MODEL,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: 0,
        success: false,
        errorCode: "cooldown_active",
      });
      return;
    }

    const budget = consumeDailyBudget(DAILY_CALL_CAP);
    if (!budget.ok) {
      await replyInThread(
        `Daily Architect budget exceeded (${budget.used}/${budget.cap} calls). Try again tomorrow.`
      );
      appendArchitectUsage({
        config: ARCHITECT_CONFIG,
        channelId: mention.channel,
        threadTs,
        model: ARCHITECT_MODEL,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: 0,
        success: false,
        errorCode: "daily_budget_exceeded",
      });
      return;
    }

    const promptWithMemory = threadContext
      ? `Thread context:\n${threadContext}\n\nCurrent request:\n${userText}`
      : userText;

    const startedAt = Date.now();
    try {
      const result = await callOpenRouter({
        apiKey,
        model: ARCHITECT_MODEL,
        maxOutputTokens: Number.isFinite(MAX_OUTPUT_TOKENS) ? MAX_OUTPUT_TOKENS : 600,
        systemPrompt: ARCHITECT_CONFIG.systemPrompt,
        userText: promptWithMemory,
      });
      const latencyMs = Date.now() - startedAt;

      appendArchitectUsage({
        config: ARCHITECT_CONFIG,
        channelId: mention.channel,
        threadTs,
        model: ARCHITECT_MODEL,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        latencyMs,
        success: true,
        errorCode: null,
      });

      await say({ text: result.text, thread_ts: threadTs });
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const errorCode =
        error instanceof Error ? error.message.slice(0, 180) : "unknown_error";

      appendArchitectUsage({
        config: ARCHITECT_CONFIG,
        channelId: mention.channel,
        threadTs,
        model: ARCHITECT_MODEL,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs,
        success: false,
        errorCode,
      });

      await say({
        text: "Architect bot could not reach OpenRouter right now. Please retry shortly.",
        thread_ts: threadTs,
      });
    }
  });

  app.event("message", async ({ event, body, say }) => {
    const message = event as MentionEvent;
    if (isBotEvent(message)) return;
    const isDm = message.channel_type === "im";
    const isChannelThreadFollowup =
      allowedChannels.has(message.channel) &&
      Boolean(message.thread_ts) &&
      isThreadActive(`${message.channel}:${message.thread_ts}`);

    if (isDm && !ARCHITECT_ALLOW_DM) return;
    if (!isDm && !isChannelThreadFollowup) return;

    // Avoid duplicate handling for mention messages; those are handled by app_mention.
    if (!isDm && /<@[^>]+>/.test(message.text ?? "")) return;

    const eventId = typeof body.event_id === "string" ? body.event_id : "missing_event_id";
    const dedupeKey = `${eventId}:${message.ts}`;
    if (isDuplicateEvent(dedupeKey)) return;

    const threadTs = message.thread_ts ?? message.ts;
    const threadKey = `${message.channel}:${threadTs}`;
    const conversationKey = isDm ? `dm:${message.channel}` : threadKey;
    if (!isDm) {
      markThreadActive(threadKey);
    }

    const reply = async (text: string): Promise<void> => {
      await say({
        text,
        ...(isDm ? {} : { thread_ts: threadTs }),
      });
    };

    const userText = (message.text ?? "").trim();
    if (!userText) {
      await reply("Please send a request message.");
      return;
    }

    let promptWithMemory = userText;
    let threadContext = "";
    if (!isDm) {
      try {
        threadContext = await buildThreadContext({
          app,
          botToken,
          channel: message.channel,
          threadTs,
          currentEventTs: message.ts,
        });
        promptWithMemory = threadContext
          ? `Thread context:\n${threadContext}\n\nCurrent request:\n${userText}`
          : userText;
      } catch {
        promptWithMemory = userText;
        threadContext = "";
      }
    }

    if (
      await maybeHandleTaskFlow({
        conversationKey,
        threadTs,
        channelId: message.channel,
        userText,
        threadContext,
        reply,
      })
    ) {
      return;
    }

    if (isThreadCoolingDown(threadKey, THREAD_COOLDOWN_MS)) {
      await reply(
        isDm
          ? "Cooldown active for this DM thread. Please wait before the next Architect request."
          : "Cooldown active for this thread. Please wait before the next Architect request."
      );
      appendArchitectUsage({
        config: ARCHITECT_CONFIG,
        channelId: message.channel,
        threadTs,
        model: ARCHITECT_MODEL,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: 0,
        success: false,
        errorCode: isDm ? "cooldown_active_dm" : "cooldown_active",
      });
      return;
    }

    const budget = consumeDailyBudget(DAILY_CALL_CAP);
    if (!budget.ok) {
      await reply(
        `Daily Architect budget exceeded (${budget.used}/${budget.cap} calls). Try again tomorrow.`
      );
      appendArchitectUsage({
        config: ARCHITECT_CONFIG,
        channelId: message.channel,
        threadTs,
        model: ARCHITECT_MODEL,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: 0,
        success: false,
        errorCode: "daily_budget_exceeded",
      });
      return;
    }

    const startedAt = Date.now();
    try {
      const result = await callOpenRouter({
        apiKey,
        model: ARCHITECT_MODEL,
        maxOutputTokens: Number.isFinite(MAX_OUTPUT_TOKENS) ? MAX_OUTPUT_TOKENS : 600,
        systemPrompt: ARCHITECT_CONFIG.systemPrompt,
        userText: promptWithMemory,
      });
      const latencyMs = Date.now() - startedAt;

      appendArchitectUsage({
        config: ARCHITECT_CONFIG,
        channelId: message.channel,
        threadTs,
        model: ARCHITECT_MODEL,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        totalTokens: result.totalTokens,
        latencyMs,
        success: true,
        errorCode: null,
      });

      await reply(result.text);
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const errorCode =
        error instanceof Error ? error.message.slice(0, 180) : "unknown_error";

      appendArchitectUsage({
        config: ARCHITECT_CONFIG,
        channelId: message.channel,
        threadTs,
        model: ARCHITECT_MODEL,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs,
        success: false,
        errorCode,
      });

      await reply("Architect bot could not reach OpenRouter right now. Please retry shortly.");
    }
  });

  await app.start();
  console.log(
    `Architect bot started in Socket Mode (dm=${ARCHITECT_ALLOW_DM ? "enabled" : "disabled"})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

