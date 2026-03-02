import { WebClient } from "@slack/web-api";

let client: WebClient | null = null;

function getClient(): WebClient | null {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return null;
  }
  if (!client) {
    client = new WebClient(token);
  }
  return client;
}

export type PostOptions = {
  channelId: string;
  threadTs?: string;
  text: string;
};

/**
 * Post a message to Slack, optionally in a thread.
 */
export async function postToSlack(options: PostOptions): Promise<{ ok: boolean; error?: string }> {
  const web = getClient();
  if (!web) {
    return { ok: false, error: "SLACK_BOT_TOKEN not configured" };
  }
  if (!options.channelId) {
    return { ok: false, error: "channelId required" };
  }
  try {
    const result = await web.chat.postMessage({
      channel: options.channelId,
      text: options.text,
      ...(options.threadTs && { thread_ts: options.threadTs }),
    });
    return { ok: result.ok ?? false, error: result.error };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
}
