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

    const isLeadOrAdmin =
      access.role === "admin" || access.permissions["hiring_manager.view"] === true;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    let hasTeamTable = false;
    try {
      await query(`SELECT 1 FROM job_team LIMIT 0`, []);
      hasTeamTable = true;
    } catch { /* not migrated */ }

    const userIds: number[] = [];
    if (isLeadOrAdmin) {
      const usersRes = await query(`SELECT id FROM users ORDER BY id`);
      for (const r of usersRes.rows as Array<{ id: number }>) userIds.push(r.id);
    } else {
      userIds.push(access.user_id);
    }

    const recruiters: RecruiterAnalytics[] = [];
    for (const uid of userIds) {
      const row = await buildRecruiterAnalytics(uid, hasTeamTable, from, to);
      if (row && row.assigned_jds > 0) recruiters.push(row);
    }

    recruiters.sort((a, b) => b.selected - a.selected || b.closures - a.closures);

    return NextResponse.json({ recruiters });
  } catch (error) {
    console.error("analytics/recruiters GET", error);
    return NextResponse.json({ error: "Failed to load recruiter analytics" }, { status: 500 });
  }
}

type RecruiterAnalytics = {
  user_id: number;
  full_name: string;
  email: string;
  assigned_jds: number;
  active_jds: number;
  candidates_submitted: number;
  interviews_scheduled: number;
  closures: number;
  selected: number;
  rejected: number;
  submit_to_interview_pct: number;
  interview_to_selected_pct: number;
  avg_days_to_submit: number | null;
  avg_days_to_close: number | null;
};

async function buildRecruiterAnalytics(
  userId: number,
  hasTeamTable: boolean,
  from: string | null,
  to: string | null
): Promise<RecruiterAnalytics | null> {
  const ownerOrTeam = hasTeamTable
    ? `(j.created_by_user_id = $1 OR EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = j.id AND jt.user_id = $1))`
    : `j.created_by_user_id = $1`;

  let dateFilter = "";
  const params: (string | number)[] = [userId];
  if (from) { params.push(from); dateFilter += ` AND a.created_at >= $${params.length}::timestamptz`; }
  if (to) { params.push(to); dateFilter += ` AND a.created_at <= $${params.length}::timestamptz`; }

  const res = await query(
    `SELECT
       COUNT(DISTINCT j.id)::int AS assigned_jds,
       COUNT(DISTINCT j.id) FILTER (WHERE LOWER(COALESCE(j.status,'open')) IN ('open','pending approval'))::int AS active_jds,
       COUNT(a.id)::int AS candidates_submitted,
       COUNT(a.id) FILTER (WHERE a.interview_scheduled = TRUE)::int AS interviews_scheduled,
       COUNT(a.id) FILTER (WHERE a.stage = 'Selected')::int AS selected,
       COUNT(a.id) FILTER (WHERE a.stage = 'Rejected')::int AS rejected,
       COUNT(DISTINCT j.id) FILTER (WHERE LOWER(COALESCE(j.status,'open')) IN ('closed','filled'))::int AS closures
     FROM jobs j
     LEFT JOIN applications a ON a.job_id = j.id ${dateFilter}
     WHERE ${ownerOrTeam}`,
    params
  );
  const r = res.rows[0] as Record<string, number>;
  if (!r || (r.assigned_jds ?? 0) === 0) return null;

  const userRes = await query(`SELECT full_name, email FROM users WHERE id = $1`, [userId]);
  const user = userRes.rows[0] as { full_name: string; email: string } | undefined;

  const submitted = r.candidates_submitted || 0;
  const interviews = r.interviews_scheduled || 0;
  const selected = r.selected || 0;

  const submitToInterviewPct = submitted > 0 ? Math.round((interviews / submitted) * 100) : 0;
  const interviewToSelectedPct = interviews > 0 ? Math.round((selected / interviews) * 100) : 0;

  // Avg days from job creation to first application
  let avgDaysToSubmit: number | null = null;
  try {
    const atsRes = await query(
      `SELECT AVG(EXTRACT(EPOCH FROM (first_app - j.created_at)) / 86400)::numeric(10,1) AS avg_days
       FROM jobs j
       JOIN LATERAL (
         SELECT MIN(a.created_at) AS first_app FROM applications a WHERE a.job_id = j.id
       ) fa ON TRUE
       WHERE ${ownerOrTeam} AND fa.first_app IS NOT NULL`,
      [userId]
    );
    avgDaysToSubmit = atsRes.rows[0]?.avg_days != null ? Number(atsRes.rows[0].avg_days) : null;
  } catch { /* optional */ }

  // Avg days from job creation to close
  let avgDaysToClose: number | null = null;
  try {
    const atcRes = await query(
      `SELECT AVG(EXTRACT(EPOCH FROM (j.updated_at - j.created_at)) / 86400)::numeric(10,1) AS avg_days
       FROM jobs j
       WHERE ${ownerOrTeam}
         AND LOWER(COALESCE(j.status,'')) IN ('closed','filled')`,
      [userId]
    );
    avgDaysToClose = atcRes.rows[0]?.avg_days != null ? Number(atcRes.rows[0].avg_days) : null;
  } catch { /* optional */ }

  return {
    user_id: userId,
    full_name: user?.full_name ?? "Unknown",
    email: user?.email ?? "",
    assigned_jds: r.assigned_jds ?? 0,
    active_jds: r.active_jds ?? 0,
    candidates_submitted: submitted,
    interviews_scheduled: interviews,
    closures: r.closures ?? 0,
    selected,
    rejected: r.rejected ?? 0,
    submit_to_interview_pct: submitToInterviewPct,
    interview_to_selected_pct: interviewToSelectedPct,
    avg_days_to_submit: avgDaysToSubmit,
    avg_days_to_close: avgDaysToClose,
  };
}
