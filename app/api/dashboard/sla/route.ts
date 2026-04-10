import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operational SLA-style signals: stale time-in-stage, overdue interviews.
 */
export async function GET() {
  try {
    const auth = await requirePermission("pipeline.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const staleDays = 7;
    const interviewStaleHours = 2;

    const staleRes = await query(
      `
      SELECT COUNT(*)::int AS n
      FROM applications a
      WHERE a.stage NOT IN ('Selected', 'Rejected')
        AND a.updated_at < NOW() - ($1::int * INTERVAL '1 day')
      `,
      [staleDays]
    ).catch(() => ({ rows: [{ n: 0 }] }));

    const staleInterviewRes = await query(
      `
      SELECT COUNT(*)::int AS n
      FROM applications a
      WHERE a.stage = 'Interview'
        AND a.interview_scheduled = TRUE
        AND a.interview_datetime IS NOT NULL
        AND a.interview_datetime < NOW() - ($1::int * INTERVAL '1 hour')
      `,
      [interviewStaleHours]
    ).catch(() => ({ rows: [{ n: 0 }] }));

    return NextResponse.json({
      stale_in_stage_over_days: staleRes.rows?.[0]?.n ?? 0,
      stale_days_threshold: staleDays,
      interview_overdue_after_hours: staleInterviewRes.rows?.[0]?.n ?? 0,
      interview_stale_hours_threshold: interviewStaleHours,
    });
  } catch (e) {
    console.error("dashboard/sla GET", e);
    return NextResponse.json({ error: "Failed to load SLA summary" }, { status: 500 });
  }
}
