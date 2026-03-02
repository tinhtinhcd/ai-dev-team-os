/**
 * Tests for Slack events API route - bot self-event handling (TIN-21).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { POST } from "./route";

function signPayload(secret: string, body: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  return "v0=" + hmac.digest("hex");
}

describe("POST /api/slack/events", () => {
  const secret = "test-signing-secret";

  beforeEach(() => {
    process.env.SLACK_SIGNING_SECRET = secret;
  });

  afterEach(() => {
    delete process.env.SLACK_BOT_USER_ID;
    delete process.env.SLACK_SIGNING_SECRET;
  });

  it("returns 401 for invalid signature", async () => {
    const body = JSON.stringify({ type: "url_verification", challenge: "abc" });
    const res = await POST(
      new Request("http://localhost/api/slack/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-slack-signature": "v0=invalid",
        },
        body,
      })
    );

    expect(res.status).toBe(401);
  });

  it("ignores app_mention from bot self (SLACK_BOT_USER_ID)", async () => {
    process.env.SLACK_BOT_USER_ID = "U0BOT123";

    const payload = {
      type: "event_callback",
      event: {
        type: "app_mention",
        user: "U0BOT123",
        text: "<@U0BOT123> task: something",
        channel: "C123",
        ts: "123.456",
      },
    };
    const body = JSON.stringify(payload);
    const signature = signPayload(secret, body);

    const res = await POST(
      new Request("http://localhost/api/slack/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-slack-signature": signature,
        },
        body,
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    // Should return early without creating Linear issue - fetch not called
  });

  it("processes app_mention from different user", async () => {
    process.env.SLACK_BOT_USER_ID = "U0BOT123";
    process.env.LINEAR_API_KEY = "test-key";
    process.env.LINEAR_TEAM_ID = "test-team";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const payload = {
      type: "event_callback",
      event: {
        type: "app_mention",
        user: "U0USER456",
        text: "<@U0BOT123> task: Create a test",
        channel: "C123",
        ts: "123.456",
      },
    };
    const body = JSON.stringify(payload);
    const signature = signPayload(secret, body);

    const res = await POST(
      new Request("http://localhost/api/slack/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-slack-signature": signature,
        },
        body,
      })
    );

    expect(res.status).toBe(200);
    vi.unstubAllGlobals();
  });
});
