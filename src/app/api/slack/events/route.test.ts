import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const origEnv = process.env;

describe("POST /api/slack/events", () => {
  const baseUrl = "http://localhost:3000";

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.SLACK_SIGNING_SECRET = "test-signing-secret";
  });

  afterEach(() => {
    process.env = origEnv;
  });

  async function postSlackEvent(
    body: string,
    signature: string | null
  ): Promise<Response> {
    const headers = new Headers();
    if (signature) headers.set("x-slack-signature", signature);
    const req = new Request(`${baseUrl}/api/slack/events`, {
      method: "POST",
      headers,
      body,
    });
    return POST(req as import("next/server").NextRequest);
  }

  it("rejects invalid signature with 401", async () => {
    const body = '{"type":"event_callback","event":{"type":"app_mention"}}';
    const res = await postSlackEvent(body, "v0=invalid-signature");
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Invalid signature");
  });

  it("rejects missing signature with 401", async () => {
    const body = '{"type":"event_callback"}';
    const res = await postSlackEvent(body, null);
    expect(res.status).toBe(401);
  });
});
