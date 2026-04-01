import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Enterprise recruiter assistant: actionable items from live data.
 */
export async function GET() {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const uid = user.user_id;

    let hasTeamTable = false;
    try {
      await query(`SELECT 1 FROM job_team LIMIT 0`, []);
      hasTeamTable = true;
    } catch {
      // not migrated yet
    }

    const jobOwnerOrTeam = hasTeamTable
      ? `(j.created_by_user_id = $1 OR EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = j.id AND jt.user_id = $1))`
      : `j.created_by_user_id = $1`;
    const appOwnerOrTeam = hasTeamTable
      ? `(a.created_by_user_id = $1 OR EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = a.job_id AND jt.user_id = $1))`
      : `a.created_by_user_id = $1`;

    const stuck = await query(
      `SELECT a.id, a.stage, a.updated_at, c.full_name, j.title AS job_title, j.id AS job_id
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       JOIN jobs j ON j.id = a.job_id
       WHERE ${appOwnerOrTeam}
         AND ${jobOwnerOrTeam}
         AND a.stage NOT IN ('Selected', 'Rejected')
         AND a.updated_at < NOW() - INTERVAL '7 days'
       ORDER BY a.updated_at ASC
       LIMIT 12`,
      [uid]
    );

    const thinPipeline = await query(
      `SELECT j.id, j.title, j.company, COUNT(a.id)::int AS app_count
       FROM jobs j
       LEFT JOIN applications a ON a.job_id = j.id
       WHERE ${jobOwnerOrTeam}
         AND LOWER(COALESCE(j.status, 'open')) LIKE '%open%'
       GROUP BY j.id, j.title, j.company
       HAVING COUNT(a.id) < 3
       ORDER BY app_count ASC, j.created_at DESC
       LIMIT 8`,
      [uid]
    );

    let strongPool: { job_id: number; job_title: string; strong_matches: number }[] = [];
    try {
      const poolRes = await query(
        `SELECT j.id AS job_id, j.title AS job_title,
                COUNT(*) FILTER (WHERE m.match_score >= 70 AND NOT m.already_applied)::int AS strong_matches
         FROM jobs j
         LEFT JOIN candidate_job_matches m ON m.job_id = j.id
         WHERE ${jobOwnerOrTeam}
           AND LOWER(COALESCE(j.status, 'open')) LIKE '%open%'
         GROUP BY j.id, j.title
         HAVING COUNT(*) FILTER (WHERE m.match_score >= 70 AND NOT m.already_applied) > 0
         ORDER BY strong_matches DESC
         LIMIT 6`,
        [uid]
      );
      strongPool = poolRes.rows as typeof strongPool;
    } catch {
      strongPool = [];
    }

    const interviewToday = await query(
      `SELECT COUNT(*)::int AS n
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE ${appOwnerOrTeam}
         AND a.stage = 'Interview'
         AND a.interview_scheduled = TRUE
         AND a.interview_datetime::date = CURRENT_DATE`,
      [uid]
    );

    return NextResponse.json({
      stuck_candidates: stuck.rows,
      open_jobs_low_pipeline: thinPipeline.rows,
      rediscovery: strongPool,
      interviews_today: interviewToday.rows[0]?.n ?? 0,
    });
  } catch (error) {
    console.error("copilot", error);
    return NextResponse.json({ error: "Copilot unavailable" }, { status: 500 });
  }
}
