import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  type LinearWebhookPayload,
  formatLinearEventForSlack,
} from "@/lib/linear-webhook";
import { getSlackDestination } from "@/lib/thread-map";
import { postToSlack } from "@/lib/slack";

// Linear sends signature in "linear-signature" header (per @linear/sdk)
const SIGNATURE_HEADERS = ["linear-signature", "x-linear-signature", "X-Linear-Signature"] as const;

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
  const signature =
    SIGNATURE_HEADERS.map((h) => request.headers.get(h)).find(Boolean) ?? null;

  if (secret && !verifySignature(rawBody, signature, secret)) {
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
