import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthAccess } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (access.permissions["jobs.view"] === false) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isAdmin = access.role === "admin";
    const uid = access.user_id;

    let hasTeamTable = false;
    try {
      await query(`SELECT 1 FROM job_team LIMIT 0`, []);
      hasTeamTable = true;
    } catch { /* not migrated */ }

    const ownerOrTeam = hasTeamTable
      ? `(j.created_by_user_id = $1 OR EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = j.id AND jt.user_id = $1))`
      : `j.created_by_user_id = $1`;
    const jobWhere = isAdmin ? "TRUE" : ownerOrTeam;
    const params = isAdmin ? [] : [uid];

    // Application source breakdown
    const srcRes = await query(
      `SELECT
         COALESCE(NULLIF(TRIM(a.source), ''), 'Unknown') AS source,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE a.stage = 'Screening')::int AS screening,
         COUNT(*) FILTER (WHERE a.stage = 'Interview')::int AS interview,
         COUNT(*) FILTER (WHERE a.stage = 'Selected')::int AS selected,
         COUNT(*) FILTER (WHERE a.stage = 'Rejected')::int AS rejected
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE ${jobWhere}
       GROUP BY COALESCE(NULLIF(TRIM(a.source), ''), 'Unknown')
       ORDER BY total DESC`,
      params
    );

    const sources = (srcRes.rows as Array<Record<string, unknown>>).map((r) => {
      const total = Number(r.total) || 0;
      const selected = Number(r.selected) || 0;
      const interview = Number(r.interview) || 0;
      return {
        source: r.source as string,
        total,
        screening: Number(r.screening) || 0,
        interview,
        selected,
        rejected: Number(r.rejected) || 0,
        conversion_pct: total > 0 ? Math.round((selected / total) * 100) : 0,
        interview_pct: total > 0 ? Math.round((interview / total) * 100) : 0,
      };
    });

    // Candidate source breakdown (separate from application source)
    let candidateSources: Array<{ source: string; count: number }> = [];
    try {
      const cRes = await query(
        `SELECT COALESCE(NULLIF(TRIM(c.source), ''), 'Unknown') AS source, COUNT(*)::int AS count
         FROM candidates c
         GROUP BY COALESCE(NULLIF(TRIM(c.source), ''), 'Unknown')
         ORDER BY count DESC`
      );
      candidateSources = cRes.rows as Array<{ source: string; count: number }>;
    } catch { /* optional */ }

    return NextResponse.json({ sources, candidate_sources: candidateSources });
  } catch (error) {
    console.error("analytics/sources GET", error);
    return NextResponse.json({ error: "Failed to load source analytics" }, { status: 500 });
  }
}
