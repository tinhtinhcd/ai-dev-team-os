import { NextRequest, NextResponse } from "next/server";
import { queryEvents, updateEventStatus } from "@/lib/event-storage";
import {
  type LinearWebhookPayload,
  formatLinearEventForSlack,
} from "@/lib/linear-webhook";
import { getSlackDestination } from "@/lib/thread-map";
import { postToSlack } from "@/lib/slack";

/**
 * POST /api/webhooks/linear/replay
 * Replay failed or skipped events (reconciliation).
 * Query params: issueIdentifier, status (failed|skipped), since (ISO date), limit
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const issueIdentifier = searchParams.get("issueIdentifier") ?? undefined;
  const status = searchParams.get("status") as "failed" | "skipped" | undefined;
  const since = searchParams.get("since") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

  const events = queryEvents({
    issueIdentifier,
    status: status ?? "failed",
    since,
    limit,
  });

  const results: { id: string; status: string; error?: string }[] = [];

  for (const evt of events) {
    const payload = evt.rawPayload as LinearWebhookPayload;
    const formatted = formatLinearEventForSlack(payload);
    if (!formatted) {
      results.push({ id: evt.id, status: "skipped", error: "No formatter" });
      continue;
    }

    const { message, issueIdentifier: id } = formatted;
    const dest = id ? getSlackDestination(id) : null;
    if (!dest?.channelId) {
      results.push({ id: evt.id, status: "skipped", error: "No Slack mapping" });
      continue;
    }

    const result = await postToSlack({
      channelId: dest.channelId,
      threadTs: dest.threadTs,
      text: message,
    });

    if (result.ok) {
      updateEventStatus(evt.id, "processed");
      results.push({ id: evt.id, status: "processed" });
    } else {
      updateEventStatus(evt.id, "failed", result.error);
      results.push({ id: evt.id, status: "failed", error: result.error });
    }
  }

  return NextResponse.json({
    replayed: results.length,
    results,
  });
}

/**
 * GET /api/webhooks/linear/replay
 * Query stored events for inspection.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const issueIdentifier = searchParams.get("issueIdentifier") ?? undefined;
  const status = searchParams.get("status") as "failed" | "skipped" | "processed" | "received" | undefined;
  const since = searchParams.get("since") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);

  const events = queryEvents({
    issueIdentifier,
    status,
    since,
    limit,
  });

  return NextResponse.json({
    count: events.length,
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      action: e.action,
      issueIdentifier: e.issueIdentifier,
      status: e.status,
      receivedAt: e.receivedAt,
      error: e.error,
    })),
  });
}
