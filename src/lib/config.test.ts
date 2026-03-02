import { describe, it, expect } from "vitest";
import { maskSecret } from "./config";

describe("maskSecret", () => {
  it("masks long secrets showing last 4 chars", () => {
    expect(maskSecret("abcdefgh1234")).toBe("********1234");
  });

  it("returns (unset) for undefined", () => {
    expect(maskSecret(undefined)).toBe("(unset)");
  });

  it("returns **** for short secrets", () => {
    expect(maskSecret("ab")).toBe("****");
  });
});
