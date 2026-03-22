#!/usr/bin/env node

const { createSlackPoster } = require("../src/lib/slack/poster");

function usage() {
  console.log(
    [
      "Usage:",
      '  node scripts/slack-post.js "message text" [--thread <thread_ts>]',
      "",
      "Environment variables:",
      "  SLACK_BOT_TOKEN   Slack bot token (xoxb-...)",
      "  SLACK_APP_TOKEN   Slack app token (xapp-...)",
      "  SLACK_CHANNEL_ID  Default channel ID (Cxxxx)",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = [...argv];
  let threadTs;
  const messageParts = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }

    if (arg === "--thread") {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --thread <thread_ts>.");
      }
      threadTs = value;
      i += 1;
      continue;
    }

    messageParts.push(arg);
  }

  return {
    help: false,
    message: messageParts.join(" ").trim(),
    threadTs,
  };
}

async function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.help) {
      usage();
      process.exit(0);
    }

    if (!parsed.message) {
      usage();
      throw new Error("Message text is required.");
    }

    const poster = createSlackPoster({
      token: process.env.SLACK_BOT_TOKEN,
      appToken: process.env.SLACK_APP_TOKEN,
    });
    const channelId = process.env.SLACK_CHANNEL_ID;

    console.log("[slack-post] Sending message...");
    console.log(`[slack-post] channel=${channelId || "(missing env)"}`);
    if (parsed.threadTs) {
      console.log(`[slack-post] thread_ts=${parsed.threadTs}`);
    }

    const result = await poster.postMessage({
      text: parsed.message,
      threadTs: parsed.threadTs,
    });

    console.log("[slack-post] Sent successfully.");
    console.log(`[slack-post] ts=${result.ts}`);
    console.log(`[slack-post] channel=${result.channel}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[slack-post] Failed: ${message}`);
    process.exit(1);
  }
}

main();
