import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { POST } from "./route";

function signBody(body: string, secret: string): string {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  return "v0=" + hmac.digest("hex");
}

function createRequest(payload: object, secret: string): Request {
  const body = JSON.stringify(payload);
  const signature = signBody(body, secret);
  return new Request("http://localhost/api/slack/events", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "x-slack-signature": signature,
    },
  });
}

const mockCreateLinearIssue = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/lib/linear", () => ({
  createLinearIssue: (...args: unknown[]) => mockCreateLinearIssue(...args),
}));

describe("POST /api/slack/events", () => {
  const SECRET = "test-signing-secret";

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    vi.stubGlobal("process", {
      ...process,
      env: {
        ...process.env,
        SLACK_SIGNING_SECRET: SECRET,
        SLACK_BOT_TOKEN: "xoxb-test",
        LINEAR_API_KEY: "lin_api_test",
        LINEAR_TEAM_ID: "team-123",
      },
    });
    mockFetch.mockResolvedValue({ ok: true });
    mockCreateLinearIssue.mockResolvedValue({
      success: true,
      identifier: "TIN-99",
      url: "https://linear.app/issue/TIN-99",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns challenge for url_verification", async () => {
    const payload = { type: "url_verification", challenge: "challenge-token-123" };
    const req = createRequest(payload, SECRET);
    const res = await POST(req as import("next/server").NextRequest);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ challenge: "challenge-token-123" });
    expect(mockCreateLinearIssue).not.toHaveBeenCalled();
  });

  it("returns 401 for invalid signature", async () => {
    const payload = { type: "url_verification", challenge: "x" };
    const req = new Request("http://localhost/api/slack/events", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
        "x-slack-signature": "v0=invalid",
      },
    });
    const res = await POST(req as import("next/server").NextRequest);
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json).toEqual({ error: "Invalid signature" });
  });

  it("returns 500 when SLACK_SIGNING_SECRET not configured", async () => {
    const orig = process.env.SLACK_SIGNING_SECRET;
    process.env.SLACK_SIGNING_SECRET = "";
    const payload = { type: "url_verification", challenge: "x" };
    const req = createRequest(payload, SECRET);
    const res = await POST(req as import("next/server").NextRequest);
    process.env.SLACK_SIGNING_SECRET = orig;
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json).toEqual({ error: "Slack not configured" });
  });

  it("returns ok for non-app_mention events", async () => {
    const payload = {
      type: "event_callback",
      event: { type: "message", text: "hello" },
    };
    const req = createRequest(payload, SECRET);
    const res = await POST(req as import("next/server").NextRequest);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockCreateLinearIssue).not.toHaveBeenCalled();
  });

  it("ignores bot-originated app_mention (anti-spam)", async () => {
    const payload = {
      type: "event_callback",
      event: {
        type: "app_mention",
        text: "<@U123> task: From a bot",
        channel: "C123",
        ts: "1234567890.123456",
        bot_id: "B123",
      },
    };
    const req = createRequest(payload, SECRET);
    const res = await POST(req as import("next/server").NextRequest);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockCreateLinearIssue).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("posts parse error to thread when message cannot be parsed", async () => {
    const payload = {
      type: "event_callback",
      event: {
        type: "app_mention",
        text: "<@U123> random gibberish",
        channel: "C123",
        ts: "1234567890.123456",
      },
    };
    const req = createRequest(payload, SECRET);
    const res = await POST(req as import("next/server").NextRequest);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockCreateLinearIssue).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Could not parse task"),
      })
    );
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.channel).toBe("C123");
    expect(fetchBody.thread_ts).toBe("1234567890.123456");
  });

  it("uses thread_ts when event is in a thread", async () => {
    const payload = {
      type: "event_callback",
      event: {
        type: "app_mention",
        text: "<@U123> task: Test thread",
        channel: "C123",
        ts: "1234567890.123456",
        thread_ts: "1234567890.111111",
      },
    };
    const req = createRequest(payload, SECRET);
    await POST(req as import("next/server").NextRequest);
    const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(fetchBody.thread_ts).toBe("1234567890.111111");
  });

  it("creates Linear issue and posts confirmation in thread", async () => {
    const payload = {
      type: "event_callback",
      event: {
        type: "app_mention",
        text: "<@U123> task: Implement feature",
        channel: "C123",
        ts: "1234567890.123456",
      },
    };
    const req = createRequest(payload, SECRET);
    const res = await POST(req as import("next/server").NextRequest);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mockCreateLinearIssue).toHaveBeenCalledWith(
      "lin_api_test",
      expect.objectContaining({
        teamId: "team-123",
        title: "Implement feature",
      })
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        body: expect.stringContaining("Created Linear issue: TIN-99"),
      })
    );
  });

  it("posts error when Linear issue creation fails", async () => {
    mockCreateLinearIssue.mockResolvedValueOnce({
      success: false,
      error: "Team not found",
    });
    const payload = {
      type: "event_callback",
      event: {
        type: "app_mention",
        text: "<@U123> task: Fail me",
        channel: "C123",
        ts: "1234567890.123456",
      },
    };
    const req = createRequest(payload, SECRET);
    const res = await POST(req as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        body: expect.stringContaining("Failed to create Linear issue: Team not found"),
      })
    );
  });

  it("posts config error when Linear not configured", async () => {
    const origApiKey = process.env.LINEAR_API_KEY;
    const origTeamId = process.env.LINEAR_TEAM_ID;
    process.env.LINEAR_API_KEY = "";
    process.env.LINEAR_TEAM_ID = "";
    const payload = {
      type: "event_callback",
      event: {
        type: "app_mention",
        text: "<@U123> task: Need Linear",
        channel: "C123",
        ts: "1234567890.123456",
      },
    };
    const req = createRequest(payload, SECRET);
    await POST(req as import("next/server").NextRequest);
    process.env.LINEAR_API_KEY = origApiKey;
    process.env.LINEAR_TEAM_ID = origTeamId;
    expect(mockCreateLinearIssue).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        body: expect.stringContaining("Linear integration not configured"),
      })
    );
  });
});
