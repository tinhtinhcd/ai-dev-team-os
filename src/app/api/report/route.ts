import {
  reportToSlack,
  isDuplicateReport,
  markAsSent,
  type ReportPayload,
} from "@/lib/slack-reporting";

/**
 * Gateway API for agent status reporting (TIN-11).
 * POST /api/report with JSON body: { issueId, state, assignee, update, next }
 *
 * Rules: same thread per issue, no duplicates, 3s debounce, no flooding.
 */
export async function POST(request: Request) {
  try {
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
