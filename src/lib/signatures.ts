/**
 * Signature verification for Slack events and Linear webhooks.
 * Uses HMAC-SHA256 with timing-safe comparison to prevent timing attacks.
 */

import crypto from "crypto";

/** Slack signature format: v0=<hex> */
export function verifySlackSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody);
  const expected = "v0=" + hmac.digest("hex");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Linear webhook signature: raw hex HMAC-SHA256 of body.
 * Header: x-linear-signature or X-Linear-Signature
 */
export function verifyLinearSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!secret || !signature) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody);
  const digest = hmac.digest("hex");
  if (digest.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest, "hex"),
      Buffer.from(signature, "hex")
    );
  } catch {
    return false;
  }
}
