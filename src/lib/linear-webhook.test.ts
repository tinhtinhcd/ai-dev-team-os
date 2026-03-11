import { describe, it, expect } from "vitest";
import {
  formatIssueCreated,
  formatIssueUpdated,
  formatCommentCreated,
  formatPrLinkAdded,
  formatLinearEventForSlack,
  isPrLinkAttachment,
  type LinearWebhookPayload,
} from "./linear-webhook";

describe("formatIssueCreated", () => {
  it("formats issue created payload", () => {
    const payload: LinearWebhookPayload = {
      action: "create",
      type: "Issue",
      data: {
        identifier: "TIN-20",
        title: "Linear webhook event processing",
        url: "https://linear.app/team/issue/TIN-20",
        state: { name: "Todo", type: "unstarted" },
        assignee: { name: "alice", displayName: "Alice" },
      },
    };
    const msg = formatIssueCreated(payload);
    expect(msg).toContain("Issue created: TIN-20");
    expect(msg).toContain("Linear webhook event processing");
    expect(msg).toContain("Todo");
    expect(msg).toContain("Alice");
    expect(msg).toContain("Open in Linear");
  });

  it("handles missing optional fields", () => {
    const payload: LinearWebhookPayload = {
      action: "create",
      type: "Issue",
      data: { identifier: "TIN-1", title: "Test" },
    };
    const msg = formatIssueCreated(payload);
    expect(msg).toContain("TIN-1");
    expect(msg).toContain("Test");
    expect(msg).toContain("Unassigned");
  });
});

describe("formatIssueUpdated", () => {
  it("detects state change", () => {
    const payload: LinearWebhookPayload = {
      action: "update",
      type: "Issue",
      data: {
        identifier: "TIN-20",
        title: "Linear webhook",
        url: "https://linear.app/issue/TIN-20",
        state: { name: "In Progress", type: "started" },
        assignee: { name: "bob", displayName: "Bob" },
      },
      updatedFrom: {
        state: { name: "Todo", type: "unstarted" },
      },
    };
    const msg = formatIssueUpdated(payload);
    expect(msg).toContain("Issue updated: TIN-20");
    expect(msg).toContain("Todo");
    expect(msg).toContain("In Progress");
  });

  it("detects assignee change", () => {
    const payload: LinearWebhookPayload = {
      action: "update",
      type: "Issue",
      data: {
        identifier: "TIN-20",
        title: "Test",
        assignee: { name: "bob", displayName: "Bob" },
      },
      updatedFrom: {
        assignee: { name: "alice", displayName: "Alice" },
      },
    };
    const msg = formatIssueUpdated(payload);
    expect(msg).toContain("Assignee: Alice → Bob");
  });

  it("shows general update when no specific changes", () => {
    const payload: LinearWebhookPayload = {
      action: "update",
      type: "Issue",
      data: { identifier: "TIN-20", title: "Test" },
      updatedFrom: {},
    };
    const msg = formatIssueUpdated(payload);
    expect(msg).toContain("General update");
  });
});

describe("formatCommentCreated", () => {
  it("formats comment payload", () => {
    const payload: LinearWebhookPayload = {
      action: "create",
      type: "Comment",
      data: {
        body: "This is a test comment",
        issue: { identifier: "TIN-20", title: "Test" },
        user: { name: "alice", displayName: "Alice" },
      },
    };
    const msg = formatCommentCreated(payload);
    expect(msg).toContain("Comment on TIN-20");
    expect(msg).toContain("Alice");
    expect(msg).toContain("This is a test comment");
  });

  it("truncates long comments", () => {
    const longBody = "a".repeat(250);
    const payload: LinearWebhookPayload = {
      action: "create",
      type: "Comment",
      data: {
        body: longBody,
        issue: { identifier: "TIN-1" },
        user: { displayName: "User" },
      },
    };
    const msg = formatCommentCreated(payload);
    expect(msg.length).toBeLessThan(250);
    expect(msg).toContain("...");
  });
});

describe("formatPrLinkAdded", () => {
  it("formats PR link attachment", () => {
    const payload: LinearWebhookPayload = {
      action: "create",
      type: "IssueAttachment",
      data: {
        url: "https://github.com/org/repo/pull/42",
        title: "Add feature",
        metadata: { pullRequestNumber: 42, pullRequestTitle: "Add feature" },
        issue: { identifier: "TIN-20" },
      },
    };
    const msg = formatPrLinkAdded(payload);
    expect(msg).toContain("PR link added to TIN-20");
    expect(msg).toContain("PR #42");
  });
});

describe("isPrLinkAttachment", () => {
  it("returns true for GitHub PR URL", () => {
    expect(
      isPrLinkAttachment({ url: "https://github.com/org/repo/pull/123" })
    ).toBe(true);
  });

  it("returns true for GitLab MR URL", () => {
    expect(
      isPrLinkAttachment({ url: "https://gitlab.com/org/repo/-/merge_requests/1" })
    ).toBe(true);
  });

  it("returns true when metadata has pullRequestNumber", () => {
    expect(isPrLinkAttachment({ metadata: { pullRequestNumber: 1 } })).toBe(true);
  });

  it("returns false for non-PR URL", () => {
    expect(isPrLinkAttachment({ url: "https://example.com/doc" })).toBe(false);
  });
});

describe("formatLinearEventForSlack", () => {
  it("routes Issue create", () => {
    const payload: LinearWebhookPayload = {
      action: "create",
      type: "Issue",
      data: { identifier: "TIN-20", title: "Test", state: {}, assignee: null },
    };
    const result = formatLinearEventForSlack(payload);
    expect(result).not.toBeNull();
    expect(result!.issueIdentifier).toBe("TIN-20");
    expect(result!.message).toContain("Issue created");
  });

  it("routes Issue update", () => {
    const payload: LinearWebhookPayload = {
      action: "update",
      type: "Issue",
      data: { identifier: "TIN-20", title: "Test" },
      updatedFrom: {},
    };
    const result = formatLinearEventForSlack(payload);
    expect(result).not.toBeNull();
    expect(result!.issueIdentifier).toBe("TIN-20");
  });

  it("routes Comment create", () => {
    const payload: LinearWebhookPayload = {
      action: "create",
      type: "Comment",
      data: {
        body: "Hi",
        issue: { identifier: "TIN-20" },
        user: { displayName: "Alice" },
      },
    };
    const result = formatLinearEventForSlack(payload);
    expect(result).not.toBeNull();
    expect(result!.issueIdentifier).toBe("TIN-20");
    expect(result!.message).toContain("Comment");
  });

  it("routes IssueComment create (Linear alternate type)", () => {
    const payload: LinearWebhookPayload = {
      action: "create",
      type: "IssueComment",
      data: {
        body: "Follow-up",
        issue: { identifier: "TIN-42" },
        user: { displayName: "Bob" },
      },
    };
    const result = formatLinearEventForSlack(payload);
    expect(result).not.toBeNull();
    expect(result!.issueIdentifier).toBe("TIN-42");
    expect(result!.message).toContain("Comment on TIN-42");
  });

  it("routes IssueAttachment create for PR link", () => {
    const payload: LinearWebhookPayload = {
      action: "create",
      type: "IssueAttachment",
      data: {
        url: "https://github.com/org/repo/pull/1",
        issue: { identifier: "TIN-20" },
      },
    };
    const result = formatLinearEventForSlack(payload);
    expect(result).not.toBeNull();
    expect(result!.issueIdentifier).toBe("TIN-20");
    expect(result!.message).toContain("PR link");
  });

  it("returns null for unhandled event types", () => {
    expect(
      formatLinearEventForSlack({
        action: "remove",
        type: "Issue",
        data: {},
      })
    ).toBeNull();
    expect(
      formatLinearEventForSlack({
        action: "create",
        type: "Project",
        data: {},
      })
    ).toBeNull();
  });
});
