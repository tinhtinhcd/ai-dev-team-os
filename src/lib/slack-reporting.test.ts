/**
 * Tests for Slack reporting (TIN-21): formatting, debounce, duplicate logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  formatReportMessage,
  truncateUpdate,
  renderTemplate,
  isBotSelfEvent,
  isDuplicateReport,
  markAsSent,
  getReportState,
  reportToSlack,
  reportToSlackDebounced,
  DEBOUNCE_MS,
  type ReportPayload,
} from "./slack-reporting";

const samplePayload: ReportPayload = {
  issueId: "TIN-21",
  state: "In Progress",
  assignee: "agent",
  update: "Implementing reporting framework",
  next: "Add tests",
};

describe("formatReportMessage", () => {
  it("formats message per TIN-21 spec", () => {
    const msg = formatReportMessage(samplePayload);
    expect(msg).toBe(
      "[TIN-21] Status: In Progress Owner: agent Update: Implementing reporting framework Next: Add tests"
    );
  });

  it("truncates update to 1-2 lines", () => {
    const payload: ReportPayload = {
      ...samplePayload,
      update: "Line 1\nLine 2\nLine 3\nLine 4",
    };
    const msg = formatReportMessage(payload);
    expect(msg).toContain("Update: Line 1\nLine 2");
    expect(msg).not.toContain("Line 3");
  });

  it("uses (no update) when update is empty", () => {
    const payload: ReportPayload = { ...samplePayload, update: "" };
    const msg = formatReportMessage(payload);
    expect(msg).toContain("Update: (no update)");
  });
});

describe("truncateUpdate", () => {
  it("returns first 2 lines by default", () => {
    const text = "a\nb\nc\nd";
    expect(truncateUpdate(text)).toBe("a\nb");
  });

  it("filters empty lines", () => {
    const text = "  \na\n  \nb\n  ";
    expect(truncateUpdate(text)).toBe("a\nb");
  });

  it("returns (no update) for empty input", () => {
    expect(truncateUpdate("")).toBe("(no update)");
    expect(truncateUpdate("   \n  ")).toBe("(no update)");
  });

  it("respects maxLines parameter", () => {
    const text = "a\nb\nc";
    expect(truncateUpdate(text, 1)).toBe("a");
    expect(truncateUpdate(text, 3)).toBe("a\nb\nc");
  });
});

describe("renderTemplate", () => {
  it("replaces all placeholders", () => {
    const template = "{{issueId}}|{{state}}|{{assignee}}|{{update}}|{{next}}";
    const result = renderTemplate(template, samplePayload);
    expect(result).toBe(
      "TIN-21|In Progress|agent|Implementing reporting framework|Add tests"
    );
  });

  it("truncates update in template", () => {
    const payload: ReportPayload = {
      ...samplePayload,
      update: "a\nb\nc",
    };
    const result = renderTemplate("{{update}}", payload);
    expect(result).toBe("a\nb");
  });
});

describe("isBotSelfEvent", () => {
  it("returns true when event user matches bot", () => {
    expect(isBotSelfEvent("U0BOT123", "U0BOT123")).toBe(true);
  });

  it("returns false when event user differs", () => {
    expect(isBotSelfEvent("U0BOT123", "U0USER456")).toBe(false);
  });

  it("returns false when event user is undefined", () => {
    expect(isBotSelfEvent("U0BOT123", undefined)).toBe(false);
  });
});

describe("isDuplicateReport and markAsSent", () => {
  let tempDir: string;
  let lastSentPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slack-report-test-"));
    lastSentPath = path.join(tempDir, "last-sent.json");
    process.env.SLACK_LAST_SENT_PATH = lastSentPath;
  });

  afterEach(() => {
    delete process.env.SLACK_LAST_SENT_PATH;
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  it("returns false when no previous report", () => {
    expect(isDuplicateReport("TIN-21", samplePayload)).toBe(false);
  });

  it("returns true when same content sent within debounce window", () => {
    markAsSent("TIN-21", samplePayload);
    expect(isDuplicateReport("TIN-21", samplePayload)).toBe(true);
  });

  it("returns false when content differs", () => {
    markAsSent("TIN-21", samplePayload);
    const differentPayload: ReportPayload = {
      ...samplePayload,
      update: "Different update",
    };
    expect(isDuplicateReport("TIN-21", differentPayload)).toBe(false);
  });

  it("returns false when same content but past debounce window", async () => {
    markAsSent("TIN-21", samplePayload);
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS + 100));
    expect(isDuplicateReport("TIN-21", samplePayload)).toBe(false);
  });

  it("returns false for different issueId with same content", () => {
    markAsSent("TIN-21", samplePayload);
    const otherPayload: ReportPayload = { ...samplePayload, issueId: "TIN-22" };
    expect(isDuplicateReport("TIN-22", otherPayload)).toBe(false);
  });
});

describe("getReportState", () => {
  it("returns idle when no report for issue", () => {
    expect(getReportState("TIN-99")).toBe("idle");
  });
});

describe("reportToSlackDebounced", () => {
  let tempDir: string;
  let threadsPath: string;

  beforeEach(() => {
    vi.useFakeTimers();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slack-report-test-"));
    threadsPath = path.join(tempDir, "threads.json");
    process.env.SLACK_THREADS_PATH = threadsPath;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.SLACK_THREADS_PATH;
    vi.unstubAllGlobals();
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  it("coalesces rapid updates within debounce window", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, ts: "1234567890.123456" }),
    } as Response);

    const config = { token: "xoxb-test", channel: "C123" };

    reportToSlackDebounced(
      { ...samplePayload, update: "Update 1" },
      config
    );
    reportToSlackDebounced(
      { ...samplePayload, update: "Update 2" },
      config
    );
    reportToSlackDebounced(
      { ...samplePayload, update: "Update 3" },
      config
    );

    expect(mockFetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(body.text).toContain("Update 3");
  });

  it("skips duplicate content", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, ts: "1234567890.123456" }),
    } as Response);

    reportToSlackDebounced(samplePayload, {
      token: "xoxb-test",
      channel: "C123",
    });

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    reportToSlackDebounced(samplePayload, {
      token: "xoxb-test",
      channel: "C123",
    });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("reportToSlack", () => {
  let tempDir: string;
  let threadsPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slack-report-test-"));
    threadsPath = path.join(tempDir, "threads.json");
    process.env.SLACK_THREADS_PATH = threadsPath;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    delete process.env.SLACK_THREADS_PATH;
    vi.unstubAllGlobals();
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch {
      // ignore
    }
  });

  it("posts to Slack and stores thread ts on first message", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, ts: "1234567890.123456" }),
    } as Response);

    const result = await reportToSlack(samplePayload, {
      token: "xoxb-test",
      channel: "C123",
    });

    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(
          "[TIN-21] Status: In Progress Owner: agent"
        ),
      })
    );

    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(body.channel).toBe("C123");
    expect(body.thread_ts).toBeUndefined();

    const saved = JSON.parse(fs.readFileSync(threadsPath, "utf-8"));
    expect(saved["TIN-21"]).toBe("1234567890.123456");
  });

  it("replies in thread when thread ts exists", async () => {
    fs.writeFileSync(
      threadsPath,
      JSON.stringify({ "TIN-21": "1234567890.123456" })
    );

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    await reportToSlack(samplePayload, {
      token: "xoxb-test",
      channel: "C123",
    });

    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(body.thread_ts).toBe("1234567890.123456");
  });

  it("uses custom template when provided", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    } as Response);

    await reportToSlack(samplePayload, {
      token: "xoxb-test",
      channel: "C123",
      template: "Issue {{issueId}}: {{state}}",
    });

    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(body.text).toBe("Issue TIN-21: In Progress");
  });

  it("returns error when Slack API fails", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, error: "channel_not_found" }),
    } as Response);

    const result = await reportToSlack(samplePayload, {
      token: "xoxb-test",
      channel: "C123",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("channel_not_found");
  });

  it("returns error when token or channel missing", async () => {
    const result1 = await reportToSlack(samplePayload, {
      token: "",
      channel: "C123",
    });
    expect(result1.success).toBe(false);
    expect(result1.error).toContain("token");

    const result2 = await reportToSlack(samplePayload, {
      token: "xoxb-test",
      channel: "",
    });
    expect(result2.success).toBe(false);
    expect(result2.error).toContain("channel");
  });
});
