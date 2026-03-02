import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

const origEnv = process.env;

describe("POST /api/webhooks/linear", () => {
  const baseUrl = "http://localhost:3000";

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.LINEAR_WEBHOOK_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env = origEnv;
  });

  async function postLinearWebhook(
    body: string,
    signature: string | null
  ): Promise<Response> {
    const headers = new Headers();
    if (signature) headers.set("x-linear-signature", signature);
    const req = new Request(`${baseUrl}/api/webhooks/linear`, {
      method: "POST",
      headers,
      body,
    });
    return POST(req as import("next/server").NextRequest);
  }

  it("rejects invalid signature with 401", async () => {
    const body = '{"type":"Issue","action":"create","data":{"id":"123"}}';
    const res = await postLinearWebhook(body, "a".repeat(64));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Invalid signature");
  });

  it("rejects missing signature when secret is configured with 401", async () => {
    const body = '{"type":"Issue","action":"create","data":{"id":"123"}}';
    const res = await postLinearWebhook(body, null);
    expect(res.status).toBe(401);
  });
});
