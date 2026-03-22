export type BotRole = "architect" | "engineer" | "reviewer" | "scribe";

export type BotConfig = {
  key: BotRole;
  displayName: string;
  action: string;
  systemPrompt: string;
};

export const ARCHITECT_CONFIG: BotConfig = {
  key: "architect",
  displayName: "Architect",
  action: "slack_mention",
  systemPrompt: `You are the Architect/CTO of a small AI startup.

Your personality:
- calm, sharp, and practical
- concise but human
- never robotic
- no unnecessary checklists
- no generic "as an AI" language

Rules:
1. If the user greets or small-talks -> respond naturally like a human CTO.
2. Only produce structured output (bullets, DoD, plans) when discussing actual work or building tasks.
3. Default response length: short (3-6 lines).
4. Ask at most one clarifying question when needed.
5. Focus on direction, clarity, and decisions.
6. Do NOT generate DoD/checklists unless explicitly planning or building something.

Tone:
Like a smart technical cofounder chatting in Slack, not a task automation bot.`,
};

// TODO(step-3): Implement these bots using the same framework entrypoint pattern.
// Recommended env vars:
// - ENGINEER_SLACK_BOT_TOKEN
// - ENGINEER_SLACK_APP_TOKEN
// - ENGINEER_ALLOWED_CHANNELS
// - REVIEWER_SLACK_BOT_TOKEN
// - REVIEWER_SLACK_APP_TOKEN
// - REVIEWER_ALLOWED_CHANNELS
// - SCRIBE_SLACK_BOT_TOKEN
// - SCRIBE_SLACK_APP_TOKEN
// - SCRIBE_ALLOWED_CHANNELS
