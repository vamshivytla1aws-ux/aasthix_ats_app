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
    const user = auth.access;
    const jobId = Number(params.id);

    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    let hasTeamTable = false;
    try {
      await query(`SELECT 1 FROM job_team LIMIT 0`, []);
      hasTeamTable = true;
    } catch {
      // not migrated yet
    }

    const ownerOrTeam = hasTeamTable
      ? `(j.created_by_user_id = $2 OR EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = j.id AND jt.user_id = $2))`
      : `j.created_by_user_id = $2`;

    const jobCheck = await query(
      `SELECT j.id, j.status FROM jobs j WHERE j.id = $1 AND ${ownerOrTeam} LIMIT 1`,
      [jobId, user.user_id]
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
    if (hasTeamTable) {
      const teamRes = await query(
        `SELECT jt.user_id, jt.role, u.email AS user_email, u.full_name AS user_name
         FROM job_team jt JOIN users u ON u.id = jt.user_id
         WHERE jt.job_id = $1
         ORDER BY jt.role, jt.created_at`,
        [jobId]
      );
      teamMembers = teamRes.rows as typeof teamMembers;
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
