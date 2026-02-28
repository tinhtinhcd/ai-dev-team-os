/**
 * Gateway service — central event hub for AI Dev Team OS.
 * Receives events from Linear, Cursor, and routes to Slack.
 */

export const GATEWAY_VERSION = "0.1.0";

export function getHealth(): { status: string; version: string } {
  return {
    status: "ok",
    version: GATEWAY_VERSION,
  };
}
