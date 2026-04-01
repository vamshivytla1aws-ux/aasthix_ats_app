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

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("job_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

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

    let dateFilter = "";
    const baseParams: (string | number)[] = isAdmin ? [] : [uid];
    if (from) { baseParams.push(from); dateFilter += ` AND a.created_at >= $${baseParams.length}::timestamptz`; }
    if (to) { baseParams.push(to); dateFilter += ` AND a.created_at <= $${baseParams.length}::timestamptz`; }

    if (jobId) {
      // Single job detail
      const jid = Number(jobId);
      if (!Number.isFinite(jid)) return NextResponse.json({ error: "Invalid job_id" }, { status: 400 });

      const params = [...baseParams, jid];
      const idx = params.length;

      const res = await query(
        `SELECT
           j.id, j.title, j.company, j.status, j.created_at,
           COUNT(a.id)::int AS total,
           COUNT(a.id) FILTER (WHERE a.stage = 'Applied')::int AS applied,
           COUNT(a.id) FILTER (WHERE a.stage = 'Screening')::int AS screening,
           COUNT(a.id) FILTER (WHERE a.stage = 'Interview')::int AS interview,
           COUNT(a.id) FILTER (WHERE a.stage = 'Selected')::int AS selected,
           COUNT(a.id) FILTER (WHERE a.stage = 'Rejected')::int AS rejected,
           MIN(a.created_at) AS first_application_at,
           MAX(a.updated_at) AS last_activity_at,
           EXTRACT(DAY FROM NOW() - j.created_at)::int AS days_open
         FROM jobs j
         LEFT JOIN applications a ON a.job_id = j.id ${dateFilter}
         WHERE j.id = $${idx} AND ${jobWhere}
         GROUP BY j.id, j.title, j.company, j.status, j.created_at`,
        params
      );
      if (res.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

      const row = res.rows[0] as Record<string, unknown>;
      const total = Number(row.total) || 0;
      const applied = Number(row.applied) || 0;
      const screening = Number(row.screening) || 0;
      const interview = Number(row.interview) || 0;
      const selected = Number(row.selected) || 0;

      const dropoffs = {
        applied_to_screening: applied > 0 ? Math.round(((applied - screening) / applied) * 100) : 0,
        screening_to_interview: screening > 0 ? Math.round(((screening - interview) / screening) * 100) : 0,
        interview_to_selected: interview > 0 ? Math.round(((interview - selected) / interview) * 100) : 0,
      };

      const timeToFirst = row.first_application_at && row.created_at
        ? Math.round((new Date(row.first_application_at as string).getTime() - new Date(row.created_at as string).getTime()) / 86400000)
        : null;

      return NextResponse.json({
        job: {
          ...row,
          dropoffs,
          time_to_first_candidate_days: timeToFirst,
        },
      });
    }

    // All jobs summary
    const res = await query(
      `SELECT
         j.id, j.title, j.company, j.status, j.created_at,
         COUNT(a.id)::int AS total,
         COUNT(a.id) FILTER (WHERE a.stage = 'Applied')::int AS applied,
         COUNT(a.id) FILTER (WHERE a.stage = 'Screening')::int AS screening,
         COUNT(a.id) FILTER (WHERE a.stage = 'Interview')::int AS interview,
         COUNT(a.id) FILTER (WHERE a.stage = 'Selected')::int AS selected,
         COUNT(a.id) FILTER (WHERE a.stage = 'Rejected')::int AS rejected,
         EXTRACT(DAY FROM NOW() - j.created_at)::int AS days_open,
         MIN(a.created_at) AS first_application_at,
         MAX(a.updated_at) AS last_activity_at
       FROM jobs j
       LEFT JOIN applications a ON a.job_id = j.id ${dateFilter}
       WHERE ${jobWhere}
       GROUP BY j.id, j.title, j.company, j.status, j.created_at
       ORDER BY j.created_at DESC NULLS LAST`,
      baseParams
    );

    const jobs = (res.rows as Array<Record<string, unknown>>).map((row) => {
      const applied = Number(row.applied) || 0;
      const screening = Number(row.screening) || 0;
      const interview = Number(row.interview) || 0;
      const selected = Number(row.selected) || 0;
      return {
        ...row,
        dropoffs: {
          applied_to_screening: applied > 0 ? Math.round(((applied - screening) / applied) * 100) : 0,
          screening_to_interview: screening > 0 ? Math.round(((screening - interview) / screening) * 100) : 0,
          interview_to_selected: interview > 0 ? Math.round(((interview - selected) / interview) * 100) : 0,
        },
      };
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("analytics/jobs GET", error);
    return NextResponse.json({ error: "Failed to load job analytics" }, { status: 500 });
  }
}
