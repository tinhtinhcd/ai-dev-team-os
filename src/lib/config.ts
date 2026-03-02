/**
 * Secure configuration management.
 * - Validates required env vars per environment
 * - Never logs or exposes secrets
 * - Environment-based credential handling
 */

const NODE_ENV = process.env.NODE_ENV ?? "development";
const isProd = NODE_ENV === "production";
const isDev = NODE_ENV === "development";

/** Mask secret for safe logging (show only last 4 chars) */
export function maskSecret(value: string | undefined): string {
  if (!value) return "(unset)";
  if (value.length <= 4) return "****";
  return "*".repeat(value.length - 4) + value.slice(-4);
}

/** Get required env var; throws if missing in production */
export function requireEnv(name: string, optionalInDev = false): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    if (isDev && optionalInDev) return "";
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
}

/** Get optional env var */
export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value?.trim() || undefined;
}

/** Slack config - signing secret required for webhook verification */
export function getSlackSigningSecret(): string | undefined {
  return optionalEnv("SLACK_SIGNING_SECRET");
}

/** Linear webhook secret - required in production for signature verification */
export function getLinearWebhookSecret(): string | undefined {
  return optionalEnv("LINEAR_WEBHOOK_SECRET");
}

/** Whether Linear webhook signature verification is required */
export function isLinearWebhookVerificationRequired(): boolean {
  const secret = getLinearWebhookSecret();
  if (secret) return true;
  return isProd; // In prod, we require the secret to be set
}

/** Report API key for access control (optional) */
export function getReportApiKey(): string | undefined {
  return optionalEnv("REPORT_API_KEY");
}

/** Whether report API requires authentication */
export function isReportAuthRequired(): boolean {
  return !!getReportApiKey();
}
