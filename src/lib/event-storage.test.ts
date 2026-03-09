import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { storeEvent, updateEventStatus, queryEvents } from "./event-storage";

const testDir = path.join(os.tmpdir(), `linear-events-test-${Date.now()}`);
const testEventsPath = path.join(testDir, "events.json");

describe("event-storage", () => {
  beforeEach(() => {
    process.env.LINEAR_EVENTS_PATH = testEventsPath;
    if (fs.existsSync(testEventsPath)) {
      fs.unlinkSync(testEventsPath);
    }
  });

  afterEach(() => {
    delete process.env.LINEAR_EVENTS_PATH;
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it("stores and retrieves events", () => {
    const payload = {
      type: "Issue",
      action: "create",
      data: { identifier: "TIN-20", id: "uuid-123", title: "Test" },
      webhookId: "wh-1",
      webhookTimestamp: 1234567890,
    };
    const stored = storeEvent(payload, "received");
    expect(stored.id).toMatch(/^evt_/);
    expect(stored.type).toBe("Issue");
    expect(stored.action).toBe("create");
    expect(stored.issueIdentifier).toBe("TIN-20");
    expect(stored.issueId).toBe("uuid-123");
    expect(stored.status).toBe("received");
  });

  it("updates event status", () => {
    const payload = { type: "Issue", action: "create", data: { identifier: "TIN-1" } };
    const stored = storeEvent(payload, "received");
    const updated = updateEventStatus(stored.id, "processed");
    expect(updated).toBe(true);
    const events = queryEvents({ issueIdentifier: "TIN-1" });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe("processed");
  });

  it("queries by issueIdentifier", () => {
    storeEvent({ type: "Issue", action: "create", data: { identifier: "TIN-20" } }, "received");
    storeEvent({ type: "Comment", action: "create", data: { issue: { identifier: "TIN-20" } } }, "received");
    storeEvent({ type: "Issue", action: "create", data: { identifier: "TIN-99" } }, "received");
    const events = queryEvents({ issueIdentifier: "TIN-20" });
    expect(events).toHaveLength(2);
  });

  it("queries by status", () => {
    const e1 = storeEvent({ type: "Issue", data: { identifier: "TIN-1" } }, "failed", "Slack error");
    storeEvent({ type: "Issue", data: { identifier: "TIN-2" } }, "processed");
    const events = queryEvents({ status: "failed" });
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(e1.id);
    expect(events[0].error).toBe("Slack error");
  });

  it("queries by type", () => {
    storeEvent({ type: "Issue", action: "create", data: { identifier: "TIN-1" } }, "received");
    storeEvent({ type: "Comment", action: "create", data: { issue: { identifier: "TIN-1" } } }, "received");
    const events = queryEvents({ type: "Comment" });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("Comment");
  });
});
