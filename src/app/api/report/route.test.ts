/**
 * Tests for report API route (TIN-21).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { POST } from "./route";

describe("POST /api/report", () => {
  let tempDir: string;
  let lastSentPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "report-api-test-"));
    lastSentPath = path.join(tempDir, "last-sent.json");
    process.env.SLACK_LAST_SENT_PATH = lastSentPath;
    process.env.SLACK_THREADS_PATH = path.join(tempDir, "threads.json");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    delete process.env.SLACK_LAST_SENT_PATH;
    delete process.env.SLACK_THREADS_PATH;
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_CHANNEL;
    vi.unstubAllGlobals();
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  it("returns 400 when required fields missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId: "TIN-21" }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("Missing required");
  });

  it("returns 503 when Slack not configured", async () => {
    const res = await POST(
      new Request("http://localhost/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId: "TIN-21",
          state: "In Progress",
          assignee: "agent",
          update: "Update",
          next: "Next",
        }),
      })
    );

    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toContain("Slack not configured");
  });

  it("posts to Slack and returns 200 when configured", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_CHANNEL = "C123";

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, ts: "1234567890.123456" }),
    } as Response);

    const res = await POST(
      new Request("http://localhost/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId: "TIN-21",
          state: "In Progress",
          assignee: "agent",
          update: "Implementing",
          next: "Add tests",
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toContain("posted");
  });

  it("returns 200 with skipped when duplicate", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_CHANNEL = "C123";
    const mockFetch = vi.mocked(fetch);

    const payload = {
      issueId: "TIN-21",
      state: "In Progress",
      assignee: "agent",
      update: "Same update",
      next: "Next",
    };

    fs.writeFileSync(
      lastSentPath,
      JSON.stringify({
        "TIN-21": {
          hash: "TIN-21|In Progress|agent|Same update|Next",
          at: Date.now(),
        },
      })
    );

    const res = await POST(
      new Request("http://localhost/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.skipped).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
