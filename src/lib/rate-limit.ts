/**
 * In-memory rate limiting for API routes.
 * Simple sliding-window style: N requests per window per key.
 */

interface Entry {
  count: number;
  windowStart: number;
}

const store = new Map<string, Entry>();

/** Cleanup old entries periodically */
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function maybeCleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - 300_000; // 5 min
  for (const [key, entry] of store.entries()) {
    if (entry.windowStart < cutoff) store.delete(key);
  }
}

export interface RateLimitOptions {
  /** Max requests per window */
  maxRequests: number;
  /** Window size in ms */
  windowMs: number;
  /** Key to rate limit by (e.g. IP, API key) */
  key: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit. Returns { allowed, remaining, resetAt }.
 * Sliding window: if window has expired, reset.
 */
export function checkRateLimit(options: RateLimitOptions): RateLimitResult {
  maybeCleanup();
  const { maxRequests, windowMs, key } = options;
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    entry = { count: 1, windowStart: now };
    store.set(key, entry);
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: now + windowMs,
    };
  }

  entry.count++;
  const allowed = entry.count <= maxRequests;
  return {
    allowed,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.windowStart + windowMs,
  };
}

/** Default: 60 requests per minute per key */
export const DEFAULT_RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60_000,
};
