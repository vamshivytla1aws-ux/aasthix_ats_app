import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCareersPublisherUserId } from "@/lib/careersPublisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public: active jobs with open headcount.
 * CAREERS_PUBLISHER_USER_ID acts as an enable switch for the portal, but the
 * public list should mirror the ATS jobs dashboard rather than a single user.
 */
export async function GET() {
  try {
    const publisherId = getCareersPublisherUserId();
    if (publisherId == null) {
      return NextResponse.json({
        configured: false,
        jobs: [] as unknown[],
        message: "Careers portal is not configured. Set CAREERS_PUBLISHER_USER_ID on the server.",
      });
    }

    const result = await query(
      `
      SELECT
        j.id,
        j.title,
        j.company,
        j.location,
        j.status,
        j.open_positions,
        j.employment_type,
        j.description,
        j.experience_requirement,
        j.created_at
      FROM jobs j
      WHERE j.open_positions IS NOT NULL
        AND j.open_positions > 0
        AND lower(trim(j.status)) LIKE '%open%'
      ORDER BY j.created_at DESC NULLS LAST, j.id DESC
      `
    );

    return NextResponse.json({
      configured: true,
      jobs: result.rows,
    });
  } catch (error) {
    console.error("careers/jobs GET", error);
    return NextResponse.json({ error: "Failed to load jobs" }, { status: 500 });
  }
}
