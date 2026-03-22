const { WebClient } = require("@slack/web-api");

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function createSlackPoster(options = {}) {
  const token = options.token ?? process.env.DEV_SLACK_BOT_TOKEN ?? process.env.SLACK_BOT_TOKEN;
  const appToken = options.appToken ?? process.env.DEV_SLACK_APP_TOKEN ?? process.env.SLACK_APP_TOKEN;
  const defaultChannelId =
    options.defaultChannelId ?? process.env.DEV_SLACK_CHANNEL_ID ?? process.env.SLACK_CHANNEL_ID;

  if (!token || !token.trim()) {
    throw new Error(
      "Missing Slack bot token. Set DEV_SLACK_BOT_TOKEN (or SLACK_BOT_TOKEN) (xoxb-...)."
    );
  }
  if (!appToken || !appToken.trim()) {
    throw new Error(
      "Missing Slack app token. Set DEV_SLACK_APP_TOKEN (or SLACK_APP_TOKEN) (xapp-...)."
    );
  }

  const client = new WebClient(token.trim());

  async function postMessage(params) {
    const text = params?.text?.trim();
    const channel = (params?.channelId ?? defaultChannelId ?? "").trim();
    const threadTs = params?.threadTs?.trim();

    if (!text) {
      throw new Error("Message text is required.");
    }
    if (!channel) {
      throw new Error("Channel ID is required. Set SLACK_CHANNEL_ID or pass channelId.");
    }

    const payload = {
      channel,
      text,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    };

    try {
      const result = await client.chat.postMessage(payload);
      return {
        ok: Boolean(result.ok),
        channel: result.channel,
        ts: result.ts,
        threadTs: threadTs || undefined,
      };
    } catch (error) {
      const apiError = error?.data?.error;
      const message = apiError
        ? `Slack API error: ${apiError}`
        : error instanceof Error
          ? error.message
          : "Unknown Slack API error";
      throw new Error(message);
    }
  }

  return {
    postMessage,
    requireEnv,
  };
}

module.exports = {
  createSlackPoster,
  requireEnv,
};
