import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/event-storage", () => ({
  queryEvents: vi.fn(() => []),
  updateEventStatus: vi.fn(() => true),
}));

vi.mock("@/lib/thread-map", () => ({
  getSlackDestination: vi.fn((id: string) =>
    id ? { channelId: "C123", threadTs: "123.456" } : { channelId: "" }
  ),
}));

vi.mock("@/lib/slack", () => ({
  postToSlack: vi.fn(() => Promise.resolve({ ok: true })),
}));

import { GET, POST } from "./route";

describe("GET /api/webhooks/linear/replay", () => {
  it("returns empty events when none match", async () => {
    const req = new Request("http://localhost/api/webhooks/linear/replay");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.count).toBe(0);
    expect(json.events).toEqual([]);
  });
});

describe("POST /api/webhooks/linear/replay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns replayed count and results", async () => {
    const { queryEvents } = await import("@/lib/event-storage");
    vi.mocked(queryEvents).mockReturnValue([
      {
        id: "evt_1",
        rawPayload: {
          type: "Issue",
          action: "create",
          data: { identifier: "TIN-20", title: "Test", state: {}, assignee: null },
        },
      } as never,
    ]);

    const req = new Request("http://localhost/api/webhooks/linear/replay?status=failed");
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.replayed).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(json.results)).toBe(true);
  });
});
