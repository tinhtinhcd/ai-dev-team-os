/**
 * Parses Slack messages in the format:
 *
 * @Van Bot task: <title>
 * context: <optional>
 * acceptance: <optional>
 */

export interface ParsedTask {
  title: string;
  context?: string;
  acceptance?: string;
}

const KEY_PATTERN = /^(task|context|acceptance)\s*:\s*(.*)$/i;

export function parseTaskMessage(text: string): ParsedTask | null {
  // Strip Slack user/channel mentions (e.g. <@U123> or <#C123>)
  const stripped = text.replace(/<@[A-Z0-9]+>/g, "").replace(/<#[A-Z0-9]+\|[^>]+>/g, "");
  const normalized = stripped.replace(/\r\n/g, "\n").trim();
  const lines = normalized.split("\n");

  let title = "";
  let context = "";
  let acceptance = "";
  let current: "task" | "context" | "acceptance" | null = null;
  let currentContent: string[] = [];

  const flush = () => {
    const joined = currentContent.join("\n").trim();
    if (current === "task") title = joined;
    else if (current === "context") context = joined;
    else if (current === "acceptance") acceptance = joined;
    currentContent = [];
  };

  for (const line of lines) {
    const match = line.match(KEY_PATTERN);
    if (match) {
      flush();
      const [, key, value] = match;
      current = key.toLowerCase() as "task" | "context" | "acceptance";
      if (value.trim()) currentContent = [value.trim()];
    } else if (current && line.trim()) {
      currentContent.push(line.trim());
    }
  }
  flush();

  if (!title) return null;
  return {
    title,
    context: context || undefined,
    acceptance: acceptance || undefined,
  };
}

export function buildLinearDescription(parsed: ParsedTask, slackThreadUrl?: string): string {
  const parts: string[] = [];

  if (parsed.context) {
    parts.push("## Context\n\n" + parsed.context);
  }
  if (parsed.acceptance) {
    parts.push("## Acceptance Criteria\n\n" + parsed.acceptance);
  }
  if (slackThreadUrl) {
    parts.push("\n---\n**Slack thread:** " + slackThreadUrl);
  }

  return parts.join("\n\n") || "";
}
