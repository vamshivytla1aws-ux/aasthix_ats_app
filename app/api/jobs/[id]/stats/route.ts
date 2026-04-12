import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

/**
 * GET /api/jobs/[id]/stats
 *
 * Returns pipeline summary for a single job:
 * - total_applications, stage breakdown, team members, last_activity_at
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const jobId = Number(params.id);

    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    const jobCheck = await query(
      `SELECT j.id, j.status FROM jobs j WHERE j.id = $1 LIMIT 1`,
      [jobId]
    );
    if (!jobCheck.rowCount) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const stageRes = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE stage = 'Applied')::int AS applied,
         COUNT(*) FILTER (WHERE stage = 'Screening')::int AS screening,
         COUNT(*) FILTER (WHERE stage = 'Interview')::int AS interview,
         COUNT(*) FILTER (WHERE stage = 'Selected')::int AS selected,
         COUNT(*) FILTER (WHERE stage = 'Rejected')::int AS rejected,
         MAX(a.updated_at) AS last_activity_at
       FROM applications a
       WHERE a.job_id = $1`,
      [jobId]
    );
    const s = stageRes.rows[0] as {
      total: number;
      applied: number;
      screening: number;
      interview: number;
      selected: number;
      rejected: number;
      last_activity_at: string | null;
    };

    let teamMembers: Array<{ user_id: number; role: string; user_email: string; user_name: string }> = [];
    try {
      const teamRes = await query(
        `SELECT jt.user_id, jt.role, u.email AS user_email, u.full_name AS user_name
         FROM job_team jt JOIN users u ON u.id = jt.user_id
         WHERE jt.job_id = $1
         ORDER BY jt.role, jt.created_at`,
        [jobId]
      );
      teamMembers = teamRes.rows as typeof teamMembers;
    } catch {
      // job_team may not exist in older environments
    }

    return NextResponse.json({
      job_id: jobId,
      total_applications: s.total,
      stage_counts: {
        applied: s.applied,
        screening: s.screening,
        interview: s.interview,
        selected: s.selected,
        rejected: s.rejected,
      },
      team_members: teamMembers,
      last_activity_at: s.last_activity_at,
    });
  } catch (error) {
    console.error("job stats GET", error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
