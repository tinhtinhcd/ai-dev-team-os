import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createLinearIssue } from "@/lib/linear";
import { parseTaskMessage, buildLinearDescription } from "@/lib/slack-task";
import { isBotSelfEvent } from "@/lib/slack-reporting";

function verifySlackSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  const expected = "v0=" + hmac.digest("hex");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function postSlackMessage(
  channel: string,
  threadTs: string,
  text: string,
  botToken: string
): Promise<void> {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify({
      channel,
      thread_ts: threadTs,
      text,
    }),
  });
}

export async function POST(request: NextRequest) {
  const secret = process.env.SLACK_SIGNING_SECRET;
  const linearApiKey = process.env.LINEAR_API_KEY;
  const linearTeamId = process.env.LINEAR_TEAM_ID;
  const linearCursorUserId = process.env.LINEAR_CURSOR_USER_ID;
  const slackBotToken = process.env.SLACK_BOT_TOKEN;

  if (!secret) {
    console.error("SLACK_SIGNING_SECRET not configured");
    return NextResponse.json({ error: "Slack not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-slack-signature");

  if (!verifySlackSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: {
    type?: string;
    challenge?: string;
    event?: {
      type?: string;
      text?: string;
      channel?: string;
      ts?: string;
      thread_ts?: string;
      user?: string;
      bot_id?: string;
    };
  };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type !== "event_callback" || payload.event?.type !== "app_mention") {
    return NextResponse.json({ ok: true });
  }

  const event = payload.event;

  if (event.bot_id) {
    return NextResponse.json({ ok: true });
  }
  // Ignore bot self-events to prevent loops
  const botUserId = process.env.SLACK_BOT_USER_ID;
  if (botUserId && isBotSelfEvent(botUserId, event.user)) {
    return NextResponse.json({ ok: true });
  }

  const text = event.text ?? "";
  const channel = event.channel ?? "";
  const threadTs = event.thread_ts ?? event.ts ?? "";

  const parsed = parseTaskMessage(text);
  if (!parsed) {
    if (slackBotToken && channel && threadTs) {
      await postSlackMessage(
        channel,
        threadTs,
        "Could not parse task. Use format:\n`task: <title>`\n`context: <optional>`\n`acceptance: <optional>`",
        slackBotToken
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (!linearApiKey || !linearTeamId) {
    if (slackBotToken && channel && threadTs) {
      await postSlackMessage(
        channel,
        threadTs,
        "Linear integration not configured (LINEAR_API_KEY, LINEAR_TEAM_ID required).",
        slackBotToken
      );
    }
    return NextResponse.json({ ok: true });
  }

  const slackWorkspace = process.env.SLACK_WORKSPACE_URL ?? "https://vanaiworkspace.slack.com";
  const slackThreadUrl = channel && threadTs
    ? `${slackWorkspace}/archives/${channel}/p${threadTs.replace(".", "")}`
    : undefined;

  const description = buildLinearDescription(parsed, slackThreadUrl);

  const result = await createLinearIssue(linearApiKey, {
    teamId: linearTeamId,
    title: parsed.title,
    description: description || undefined,
    assigneeId: linearCursorUserId || undefined,
  });

  if (!result.success) {
    if (slackBotToken && channel && threadTs) {
      await postSlackMessage(
        channel,
        threadTs,
        `Failed to create Linear issue: ${result.error}`,
        slackBotToken
      );
    }
    return NextResponse.json({ ok: true });
  }

  const link = result.url ?? (result.identifier ? `https://linear.app/issue/${result.identifier}` : "");
  const confirmMsg = link
    ? `Created Linear issue: ${result.identifier} — ${link}`
    : `Created Linear issue: ${result.identifier}`;

  if (slackBotToken && channel && threadTs) {
    await postSlackMessage(channel, threadTs, confirmMsg, slackBotToken);
  }

  return NextResponse.json({ ok: true });
}
