import { createRequire } from "module";
import { WebClient } from "@slack/web-api";

const require = createRequire(import.meta.url);
const { App, ExpressReceiver } = require("@slack/bolt");
import { LinearClient } from "@linear/sdk";
import { storeMapping } from "./db.js";

const slackBotToken = process.env.SLACK_BOT_TOKEN;
const slackSigningSecret = process.env.SLACK_SIGNING_SECRET;
const linearApiKey = process.env.LINEAR_API_KEY;
const linearTeamId = process.env.LINEAR_TEAM_ID;

if (!slackBotToken || !slackSigningSecret) {
  throw new Error("SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET are required");
}

const receiver = new ExpressReceiver({
  signingSecret: slackSigningSecret,
  endpoints: { events: "/slack/events" },
  processBeforeResponse: true,
});

const app = new App({
  token: slackBotToken,
  signingSecret: slackSigningSecret,
  receiver,
});

// Handle app mention: create Linear issue and store mapping
app.event("app_mention", async ({
  event,
  say,
}: {
  event: { text: string; channel: string; thread_ts?: string; ts: string };
  say: (opts: { text: string; thread_ts: string }) => Promise<unknown>;
}) => {
  const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();
  const title = text.slice(0, 200) || "New issue from Slack";
  const channelId = event.channel;
  const threadTs = event.thread_ts ?? event.ts;

  if (!linearApiKey || !linearTeamId) {
    await say({
      text: "Gateway not configured: LINEAR_API_KEY or LINEAR_TEAM_ID missing.",
      thread_ts: threadTs,
    });
    return;
  }

  try {
    const linear = new LinearClient({ apiKey: linearApiKey });
    const payload = await linear.createIssue({
      teamId: linearTeamId,
      title,
      description: text ? `From Slack:\n\n${text}` : undefined,
    });

    if (!payload.success || !payload.issueId) {
      await say({
        text: "Failed to create Linear issue.",
        thread_ts: threadTs,
      });
      return;
    }

    const linearIssueId = payload.issueId;
    storeMapping(linearIssueId, channelId, threadTs);

    const issue = payload.issue ? await payload.issue : null;
    const identifier = issue?.identifier ?? "unknown";
    const url = issue?.url ?? `https://linear.app/issue/${identifier}`;
    await say({
      text: `Created Linear issue: ${identifier} — ${url}`,
      thread_ts: threadTs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await say({
      text: `Failed to create Linear issue: ${msg}`,
      thread_ts: threadTs,
    });
  }
});

export { app as slackApp, receiver };

export async function postToSlackThread(
  channelId: string,
  threadTs: string,
  text: string
): Promise<boolean> {
  if (!slackBotToken) return false;
  try {
    const web = new WebClient(slackBotToken);
    await web.chat.postMessage({ channel: channelId, thread_ts: threadTs, text });
    return true;
  } catch {
    return false;
  }
}
