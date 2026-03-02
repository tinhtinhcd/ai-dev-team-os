import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  verifySlackSignature,
  verifyLinearSignature,
} from "./signatures";

describe("verifySlackSignature", () => {
  const secret = "test-signing-secret";
  const body = '{"type":"event_callback","event":{"type":"app_mention"}}';

  function computeSlackSig(b: string, s: string): string {
    const hmac = crypto.createHmac("sha256", s);
    hmac.update(b);
    return "v0=" + hmac.digest("hex");
  }

  it("accepts valid signature", () => {
    const sig = computeSlackSig(body, secret);
    expect(verifySlackSignature(body, sig, secret)).toBe(true);
  });

  it("rejects invalid signature", () => {
    expect(verifySlackSignature(body, "v0=invalid", secret)).toBe(false);
    expect(verifySlackSignature(body, "v0=" + "a".repeat(64), secret)).toBe(false);
  });

  it("rejects tampered body", () => {
    const sig = computeSlackSig(body, secret);
    expect(verifySlackSignature(body + "x", sig, secret)).toBe(false);
  });

  it("rejects wrong secret", () => {
    const sig = computeSlackSig(body, secret);
    expect(verifySlackSignature(body, sig, "wrong-secret")).toBe(false);
  });

  it("rejects null/empty signature", () => {
    expect(verifySlackSignature(body, null, secret)).toBe(false);
    expect(verifySlackSignature(body, "", secret)).toBe(false);
  });

  it("rejects null/empty secret", () => {
    const sig = computeSlackSig(body, secret);
    expect(verifySlackSignature(body, sig, "")).toBe(false);
  });
});

describe("verifyLinearSignature", () => {
  const secret = "linear-webhook-secret";
  const body = '{"type":"Issue","action":"create","data":{"id":"123"}}';

  function computeLinearSig(b: string, s: string): string {
    const hmac = crypto.createHmac("sha256", s);
    hmac.update(b);
    return hmac.digest("hex");
  }

  it("accepts valid signature", () => {
    const sig = computeLinearSig(body, secret);
    expect(verifyLinearSignature(body, sig, secret)).toBe(true);
  });

  it("rejects invalid signature", () => {
    expect(verifyLinearSignature(body, "a".repeat(64), secret)).toBe(false);
    expect(verifyLinearSignature(body, "invalid", secret)).toBe(false);
  });

  it("rejects tampered body", () => {
    const sig = computeLinearSig(body, secret);
    expect(verifyLinearSignature(body + "}", sig, secret)).toBe(false);
  });

  it("rejects wrong secret", () => {
    const sig = computeLinearSig(body, secret);
    expect(verifyLinearSignature(body, sig, "wrong-secret")).toBe(false);
  });

  it("rejects null/empty signature", () => {
    expect(verifyLinearSignature(body, null, secret)).toBe(false);
    expect(verifyLinearSignature(body, "", secret)).toBe(false);
  });

  it("rejects null/empty secret", () => {
    const sig = computeLinearSig(body, secret);
    expect(verifyLinearSignature(body, sig, "")).toBe(false);
  });
});
