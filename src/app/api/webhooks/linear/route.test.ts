import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the route
vi.mock("@/lib/thread-map", () => ({
  getSlackDestination: vi.fn((id: string) =>
    id === "TIN-20"
      ? { channelId: "C123", threadTs: "123.456" }
      : { channelId: "" }
  ),
}));

vi.mock("@/lib/slack", () => ({
  postToSlack: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock("@/lib/event-storage", () => ({
  storeEvent: vi.fn((payload: unknown) => ({
    id: "evt_test_123",
    type: (payload as { type?: string }).type,
    action: (payload as { action?: string }).action,
    status: "received",
  })),
  updateEventStatus: vi.fn(() => true),
}));

// Import after mocks
import { POST } from "./route";

function buildRequest(body: object, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/webhooks/linear", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/webhooks/linear", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LINEAR_WEBHOOK_SECRET;
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/webhooks/linear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json {{{",
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("processes Issue create and posts to Slack", async () => {
    const payload = {
      action: "create",
      type: "Issue",
      data: {
        identifier: "TIN-20",
        title: "Test issue",
        url: "https://linear.app/issue/TIN-20",
        state: { name: "Todo" },
        assignee: null,
      },
    };
    const req = buildRequest(payload);
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
    expect(json.posted).toBe(true);
  });

  it("returns skipped when no Slack mapping", async () => {
    const { getSlackDestination } = await import("@/lib/thread-map");
    vi.mocked(getSlackDestination).mockReturnValue({ channelId: "" });

    const payload = {
      action: "create",
      type: "Issue",
      data: { identifier: "TIN-99", title: "Orphan" },
    };
    const req = buildRequest(payload);
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
    expect(json.skipped).toContain("No Slack mapping");
  });

  it("returns received for unhandled event type", async () => {
    const payload = {
      action: "remove",
      type: "Issue",
      data: { identifier: "TIN-20" },
    };
    const req = buildRequest(payload);
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.received).toBe(true);
    expect(json.posted).toBeUndefined();
  });
});
