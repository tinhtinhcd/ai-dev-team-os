import { describe, it, expect } from "vitest";
import { parseTaskMessage, buildLinearDescription } from "./slack-task";

describe("parseTaskMessage", () => {
  it("parses minimal task with title only", () => {
    const result = parseTaskMessage("task: Fix the bug");
    expect(result).toEqual({
      title: "Fix the bug",
      context: undefined,
      acceptance: undefined,
    });
  });

  it("strips Slack user mentions from text", () => {
    const result = parseTaskMessage("<@U123ABC> task: Add feature");
    expect(result).toEqual({
      title: "Add feature",
      context: undefined,
      acceptance: undefined,
    });
  });

  it("strips Slack channel mentions", () => {
    const result = parseTaskMessage("<#C123|general> task: Update docs");
    expect(result).toEqual({
      title: "Update docs",
      context: undefined,
      acceptance: undefined,
    });
  });

  it("parses task with context and acceptance", () => {
    const text = `task: Implement auth
context: User needs to log in
acceptance: Login form works`;
    const result = parseTaskMessage(text);
    expect(result).toEqual({
      title: "Implement auth",
      context: "User needs to log in",
      acceptance: "Login form works",
    });
  });

  it("parses multiline context and acceptance", () => {
    const text = `task: Refactor API
context: Current code is messy
  and hard to maintain
acceptance: All tests pass
  and no regressions`;
    const result = parseTaskMessage(text);
    expect(result).toEqual({
      title: "Refactor API",
      context: "Current code is messy\nand hard to maintain",
      acceptance: "All tests pass\nand no regressions",
    });
  });

  it("returns null for empty or missing task", () => {
    expect(parseTaskMessage("")).toBeNull();
    expect(parseTaskMessage("context: something")).toBeNull();
    expect(parseTaskMessage("acceptance: something")).toBeNull();
    expect(parseTaskMessage("random text")).toBeNull();
  });

  it("handles case-insensitive keys", () => {
    expect(parseTaskMessage("TASK: Foo")).toEqual({
      title: "Foo",
      context: undefined,
      acceptance: undefined,
    });
    expect(parseTaskMessage("Task: Bar")).toEqual({
      title: "Bar",
      context: undefined,
      acceptance: undefined,
    });
  });

  it("normalizes CRLF to LF", () => {
    const result = parseTaskMessage("task: Test\r\ncontext: Line two");
    expect(result).toEqual({
      title: "Test",
      context: "Line two",
      acceptance: undefined,
    });
  });
});

describe("buildLinearDescription", () => {
  it("returns empty string when no context, acceptance, or slack url", () => {
    const result = buildLinearDescription({
      title: "Foo",
    });
    expect(result).toBe("");
  });

  it("includes context section when present", () => {
    const result = buildLinearDescription({
      title: "Foo",
      context: "Some context",
    });
    expect(result).toContain("## Context");
    expect(result).toContain("Some context");
  });

  it("includes acceptance section when present", () => {
    const result = buildLinearDescription({
      title: "Foo",
      acceptance: "Tests pass",
    });
    expect(result).toContain("## Acceptance Criteria");
    expect(result).toContain("Tests pass");
  });

  it("includes Slack thread URL when provided", () => {
    const url = "https://workspace.slack.com/archives/C123/p123456";
    const result = buildLinearDescription(
      { title: "Foo" },
      url
    );
    expect(result).toContain("Slack thread:");
    expect(result).toContain(url);
  });

  it("combines all sections", () => {
    const result = buildLinearDescription(
      {
        title: "Foo",
        context: "Context here",
        acceptance: "Acceptance here",
      },
      "https://slack.com/thread"
    );
    expect(result).toContain("## Context");
    expect(result).toContain("Context here");
    expect(result).toContain("## Acceptance Criteria");
    expect(result).toContain("Acceptance here");
    expect(result).toContain("Slack thread:");
    expect(result).toContain("https://slack.com/thread");
  });
});
