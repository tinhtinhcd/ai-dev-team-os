import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    // Rate limit uses a module-level Map; we can't easily reset it,
    // so we use unique keys per test to avoid interference
  });

  it("allows requests under limit", () => {
    const key = `test-allow-${Date.now()}`;
    const result = checkRateLimit({
      maxRequests: 5,
      windowMs: 60_000,
      key,
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("blocks requests over limit", () => {
    const key = `test-block-${Date.now()}`;
    const opts = { maxRequests: 3, windowMs: 60_000, key };

    checkRateLimit(opts);
    checkRateLimit(opts);
    const third = checkRateLimit(opts);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = checkRateLimit(opts);
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("returns resetAt in future", () => {
    const key = `test-reset-${Date.now()}`;
    const result = checkRateLimit({
      maxRequests: 10,
      windowMs: 60_000,
      key,
    });
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  it("tracks different keys independently", () => {
    const base = `test-indep-${Date.now()}`;
    const opts = { maxRequests: 2, windowMs: 60_000 };

    checkRateLimit({ ...opts, key: `${base}-a` });
    checkRateLimit({ ...opts, key: `${base}-a` });
    const aThird = checkRateLimit({ ...opts, key: `${base}-a` });
    expect(aThird.allowed).toBe(false);

    const bFirst = checkRateLimit({ ...opts, key: `${base}-b` });
    expect(bFirst.allowed).toBe(true);
    expect(bFirst.remaining).toBe(1);
  });
});
