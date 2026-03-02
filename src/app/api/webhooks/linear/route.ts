import { NextRequest, NextResponse } from "next/server";
import {
  verifyLinearSignature,
} from "@/lib/signatures";
import {
  type LinearWebhookPayload,
  formatLinearEventForSlack,
} from "@/lib/linear-webhook";
import { getSlackDestination } from "@/lib/thread-map";
import { postToSlack } from "@/lib/slack";
import {
  getLinearWebhookSecret,
  isLinearWebhookVerificationRequired,
} from "@/lib/config";
import {
  checkRateLimit,
  DEFAULT_RATE_LIMIT,
} from "@/lib/rate-limit";

const SIGNATURE_HEADER = "x-linear-signature";

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() ?? realIp ?? "unknown";
}

export async function POST(request: NextRequest) {
  const key = getRateLimitKey(request);
  const limit = checkRateLimit({
    ...DEFAULT_RATE_LIMIT,
    key: `linear:${key}`,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429 }
    );
  }

  const secret = getLinearWebhookSecret();
  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER) ?? request.headers.get("X-Linear-Signature");

  if (isLinearWebhookVerificationRequired() && !secret) {
    return NextResponse.json(
      { error: "Linear webhook not configured" },
      { status: 503 }
    );
  }
  if (secret && !verifyLinearSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: LinearWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as LinearWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const formatted = formatLinearEventForSlack(payload);
  if (!formatted) {
    return NextResponse.json({ received: true });
  }

  const { message, issueIdentifier } = formatted;
  const dest = issueIdentifier ? getSlackDestination(issueIdentifier) : null;

  if (!dest || !dest.channelId) {
    return NextResponse.json({
      received: true,
      skipped: "No Slack mapping for issue",
    });
  }

  const result = await postToSlack({
    channelId: dest.channelId,
    threadTs: dest.threadTs,
    text: message,
  });

  if (!result.ok) {
    return NextResponse.json(
      { received: true, error: result.error },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true, posted: true });
}
