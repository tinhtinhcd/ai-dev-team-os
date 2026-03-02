import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  type LinearWebhookPayload,
  formatLinearEventForSlack,
} from "@/lib/linear-webhook";
import { getSlackDestination } from "@/lib/thread-map";
import { postToSlack } from "@/lib/slack";
import { storeEvent, updateEventStatus } from "@/lib/event-storage";

const SIGNATURE_HEADER = "x-linear-signature";

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!secret || !signature) {
    return false;
  }
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody);
  const digest = hmac.digest("hex");
  if (digest.length !== signature.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.LINEAR_WEBHOOK_SECRET;
  const rawBody = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER) ?? request.headers.get("X-Linear-Signature");

  if (secret && !verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: LinearWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as LinearWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Persistent event logging
  const stored = storeEvent(payload as Record<string, unknown>, "received");

  const formatted = formatLinearEventForSlack(payload);
  if (!formatted) {
    updateEventStatus(stored.id, "skipped");
    return NextResponse.json({ received: true });
  }

  const { message, issueIdentifier } = formatted;
  const dest = issueIdentifier ? getSlackDestination(issueIdentifier) : null;

  if (!dest || !dest.channelId) {
    updateEventStatus(stored.id, "skipped", "No Slack mapping for issue");
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
    updateEventStatus(stored.id, "failed", result.error);
    return NextResponse.json(
      { received: true, error: result.error },
      { status: 500 }
    );
  }

  updateEventStatus(stored.id, "processed");
  return NextResponse.json({ received: true, posted: true });
}
