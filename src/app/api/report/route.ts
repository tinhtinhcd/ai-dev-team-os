import {
  reportToSlack,
  isDuplicateReport,
  markAsSent,
  type ReportPayload,
} from "@/lib/slack-reporting";
import { getReportApiKey, isReportAuthRequired } from "@/lib/config";
import {
  checkRateLimit,
  DEFAULT_RATE_LIMIT,
} from "@/lib/rate-limit";

function getRateLimitKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const apiKey = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    ?? request.headers.get("x-api-key");
  return apiKey ?? forwarded?.split(",")[0]?.trim() ?? realIp ?? "unknown";
}

/**
 * Gateway API for agent status reporting (TIN-11).
 * POST /api/report with JSON body: { issueId, state, assignee, update, next }
 *
 * Rules: same thread per issue, no duplicates, 3s debounce, no flooding.
 * Access control: REPORT_API_KEY required when set (Bearer or X-API-Key).
 */
export async function POST(request: Request) {
  try {
    if (isReportAuthRequired()) {
      const expectedKey = getReportApiKey();
      const auth = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
        ?? request.headers.get("x-api-key");
      if (!auth || auth !== expectedKey) {
        return Response.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }
    }

    const key = getRateLimitKey(request);
    const limit = checkRateLimit({
      ...DEFAULT_RATE_LIMIT,
      maxRequests: 30,
      key: `report:${key}`,
    });
    if (!limit.allowed) {
      return Response.json(
        { success: false, error: "Rate limit exceeded" },
        { status: 429 }
      );
    }

    const body = (await request.json()) as Partial<ReportPayload>;
    const { issueId, state, assignee, update, next } = body;

    if (!issueId || !state || !assignee || !update || !next) {
      return Response.json(
        {
          success: false,
          error:
            "Missing required fields: issueId, state, assignee, update, next",
        },
        { status: 400 }
      );
    }

    const payload: ReportPayload = {
      issueId,
      state,
      assignee,
      update: String(update).trim(),
      next,
    };

    // Anti-spam: skip duplicate (same content within 3s)
    if (isDuplicateReport(issueId, payload)) {
      return Response.json({
        success: true,
        skipped: true,
        message: "Duplicate report ignored (debounced)",
      });
    }

    const token = process.env.SLACK_BOT_TOKEN;
    const channel = process.env.SLACK_CHANNEL;

    if (!token || !channel) {
      return Response.json(
        {
          success: false,
          error:
            "Slack not configured. Set SLACK_BOT_TOKEN and SLACK_CHANNEL.",
        },
        { status: 503 }
      );
    }

    const result = await reportToSlack(payload, { token, channel });

    if (result.success) {
      markAsSent(issueId, payload);
    }

    return Response.json(
      result.success
        ? { success: true, message: "Report posted to Slack" }
        : { success: false, error: result.error },
      { status: result.success ? 200 : 500 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
