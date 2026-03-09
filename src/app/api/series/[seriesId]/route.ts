import { z } from "zod";
import {
  updateSeries,
  getSeries,
  upsertSeries,
} from "@/lib/series-store";

// Valid enum values for series fields (TIN-36)
const PRIMARY_LANGUAGES = [
  "en",
  "es",
  "fr",
  "de",
  "ja",
  "zh",
  "ko",
  "pt",
  "it",
  "ru",
] as const;

const PREFERRED_OUTPUT_LANGUAGES = [
  "en",
  "es",
  "fr",
  "de",
  "ja",
  "zh",
  "ko",
  "pt",
  "it",
  "ru",
] as const;

const MODES = ["draft", "edit", "preview", "publish", "archive"] as const;

const patchSeriesSchema = z.object({
  primaryLanguage: z.enum(PRIMARY_LANGUAGES).optional(),
  preferredOutputLanguage: z.enum(PREFERRED_OUTPUT_LANGUAGES).optional(),
  mode: z.enum(MODES).optional(),
});

export type PatchSeriesBody = z.infer<typeof patchSeriesSchema>;

/**
 * PATCH /api/series/[seriesId]
 * Updates a series with validated enum fields (TIN-36).
 * Validates primaryLanguage, preferredOutputLanguage, and mode before writing to DB.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ seriesId: string }> }
) {
  try {
    const { seriesId } = await params;
    if (!seriesId) {
      return Response.json(
        { success: false, error: "Missing seriesId" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = patchSeriesSchema.safeParse(body);

    if (!parsed.success) {
      const issues = parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      );
      return Response.json(
        {
          success: false,
          error: "Validation failed",
          details: issues,
        },
        { status: 400 }
      );
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      return Response.json(
        { success: false, error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const existing = getSeries(seriesId);
    if (existing) {
      updateSeries(seriesId, updates);
    } else {
      upsertSeries(seriesId, updates);
    }

    const updated = getSeries(seriesId);
    if (!updated) {
      return Response.json(
        { success: false, error: "Failed to read updated series" },
        { status: 500 }
      );
    }
    return Response.json({
      success: true,
      series: updated,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return Response.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
