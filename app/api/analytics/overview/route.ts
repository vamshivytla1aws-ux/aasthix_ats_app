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
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const dateFilter = buildDateFilter(from, to);
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

    // Summary cards
    const summaryRes = await query(
      `SELECT
         COUNT(DISTINCT j.id)::int AS total_jobs,
         COUNT(DISTINCT j.id) FILTER (WHERE LOWER(COALESCE(j.status,'open')) IN ('open','pending approval'))::int AS active_jobs,
         COUNT(DISTINCT j.id) FILTER (WHERE LOWER(COALESCE(j.status,'open')) IN ('closed','filled'))::int AS closed_jobs,
         COUNT(DISTINCT a.candidate_id)::int AS total_candidates,
         COUNT(a.id)::int AS total_applications,
         COUNT(a.id) FILTER (WHERE a.stage = 'Selected')::int AS offers_released,
         COUNT(a.id) FILTER (WHERE a.stage = 'Selected' AND a.updated_at >= date_trunc('month', CURRENT_DATE))::int AS closures_this_month
       FROM jobs j
       LEFT JOIN applications a ON a.job_id = j.id ${dateFilter.appWhere}
       WHERE ${jobWhere} ${dateFilter.jobWhere}`,
      isAdmin ? [...dateFilter.params] : [uid, ...dateFilter.params]
    );
    const summary = summaryRes.rows[0] as Record<string, number>;

    // Interviews today
    let interviewsToday = 0;
    try {
      const params = isAdmin ? [...dateFilter.params] : [uid];
      const itRes = await query(
        `SELECT COUNT(*)::int AS n
         FROM applications a
         JOIN jobs j ON j.id = a.job_id
         WHERE ${jobWhere}
           AND a.interview_scheduled = TRUE
           AND a.interview_datetime::date = CURRENT_DATE`,
        params
      );
      interviewsToday = itRes.rows[0]?.n ?? 0;
    } catch { /* optional */ }

    // Funnel data
    const funnelParams = isAdmin ? [...dateFilter.params] : [uid, ...dateFilter.params];
    const funnelRes = await query(
      `SELECT
         COUNT(a.id) FILTER (WHERE a.stage = 'Applied')::int AS applied,
         COUNT(a.id) FILTER (WHERE a.stage = 'Screening')::int AS screening,
         COUNT(a.id) FILTER (WHERE a.stage = 'Interview')::int AS interview,
         COUNT(a.id) FILTER (WHERE a.stage = 'Selected')::int AS selected,
         COUNT(a.id) FILTER (WHERE a.stage = 'Rejected')::int AS rejected
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE ${jobWhere} ${dateFilter.appWhere}`,
      funnelParams
    );
    const funnel = funnelRes.rows[0] as Record<string, number>;

    // Activity: pending feedback (interview done, no stage change > 2 days)
    let pendingFeedback = 0;
    try {
      const pfParams = isAdmin ? [] : [uid];
      const pfRes = await query(
        `SELECT COUNT(*)::int AS n
         FROM applications a
         JOIN jobs j ON j.id = a.job_id
         WHERE ${jobWhere}
           AND a.stage = 'Interview'
           AND a.updated_at < NOW() - INTERVAL '2 days'`,
        pfParams
      );
      pendingFeedback = pfRes.rows[0]?.n ?? 0;
    } catch { /* optional */ }

    // Inactive candidates (no update > 3 days, not in terminal stage)
    let inactiveCandidates = 0;
    try {
      const icParams = isAdmin ? [] : [uid];
      const icRes = await query(
        `SELECT COUNT(*)::int AS n
         FROM applications a
         JOIN jobs j ON j.id = a.job_id
         WHERE ${jobWhere}
           AND a.stage NOT IN ('Selected', 'Rejected')
           AND a.updated_at < NOW() - INTERVAL '3 days'`,
        icParams
      );
      inactiveCandidates = icRes.rows[0]?.n ?? 0;
    } catch { /* optional */ }

    // Trend: applications created per day (last 30 days)
    const trendParams = isAdmin ? [] : [uid];
    let trend: Array<{ date: string; count: number }> = [];
    try {
      const trendRes = await query(
        `SELECT a.created_at::date AS date, COUNT(*)::int AS count
         FROM applications a
         JOIN jobs j ON j.id = a.job_id
         WHERE ${jobWhere}
           AND a.created_at >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY a.created_at::date
         ORDER BY date`,
        trendParams
      );
      trend = trendRes.rows as Array<{ date: string; count: number }>;
    } catch { /* optional */ }

    // Smart insights
    const insights = generateInsights(summary, funnel, interviewsToday, pendingFeedback, inactiveCandidates);

    return NextResponse.json({
      summary: {
        total_jobs: summary.total_jobs ?? 0,
        active_jobs: summary.active_jobs ?? 0,
        closed_jobs: summary.closed_jobs ?? 0,
        total_candidates: summary.total_candidates ?? 0,
        total_applications: summary.total_applications ?? 0,
        offers_released: summary.offers_released ?? 0,
        closures_this_month: summary.closures_this_month ?? 0,
        interviews_today: interviewsToday,
      },
      funnel,
      activity: {
        interviews_today: interviewsToday,
        pending_feedback: pendingFeedback,
        inactive_candidates: inactiveCandidates,
      },
      trend,
      insights,
    });
  } catch (error) {
    console.error("analytics/overview GET", error);
    return NextResponse.json({ error: "Failed to load overview" }, { status: 500 });
  }
}

function buildDateFilter(from: string | null, to: string | null) {
  const params: (string | number)[] = [];
  let jobWhere = "";
  let appWhere = "";
  if (from) {
    params.push(from);
    jobWhere += ` AND j.created_at >= $${params.length + 1}::timestamptz`;
    appWhere += ` AND a.created_at >= $${params.length}::timestamptz`;
  }
  if (to) {
    params.push(to);
    jobWhere += ` AND j.created_at <= $${params.length + 1}::timestamptz`;
    appWhere += ` AND a.created_at <= $${params.length}::timestamptz`;
  }
  return { params, jobWhere, appWhere };
}

type InsightMsg = { type: "warning" | "success" | "info"; message: string };

function generateInsights(
  summary: Record<string, number>,
  funnel: Record<string, number>,
  interviewsToday: number,
  pendingFeedback: number,
  inactiveCandidates: number
): InsightMsg[] {
  const insights: InsightMsg[] = [];
  const total = funnel.applied + funnel.screening + funnel.interview + funnel.selected + funnel.rejected;

  if (total > 0) {
    const screeningPct = (funnel.screening / total) * 100;
    if (screeningPct > 40) {
      insights.push({ type: "warning", message: `Screening stage is overloaded (${Math.round(screeningPct)}% of all applications)` });
    }

    if (funnel.applied > 0 && funnel.interview > 0) {
      const interviewDropoff = ((funnel.applied - funnel.interview) / funnel.applied) * 100;
      if (interviewDropoff > 70) {
        insights.push({ type: "warning", message: `High drop-off before interview stage (${Math.round(interviewDropoff)}% never reach interview)` });
      }
    }

    if (funnel.interview > 0 && funnel.selected > 0) {
      const selectionRate = (funnel.selected / funnel.interview) * 100;
      if (selectionRate > 50) {
        insights.push({ type: "success", message: `Strong interview-to-selection rate (${Math.round(selectionRate)}%)` });
      }
    }
  }

  if (pendingFeedback > 5) {
    insights.push({ type: "warning", message: `${pendingFeedback} candidates awaiting feedback for 2+ days` });
  }

  if (inactiveCandidates > 10) {
    insights.push({ type: "warning", message: `${inactiveCandidates} candidates have been inactive for 3+ days` });
  }

  if (interviewsToday > 0) {
    insights.push({ type: "info", message: `${interviewsToday} interview${interviewsToday > 1 ? "s" : ""} scheduled today` });
  }

  if (summary.closures_this_month > 0) {
    insights.push({ type: "success", message: `${summary.closures_this_month} closure${summary.closures_this_month > 1 ? "s" : ""} this month` });
  }

  if (summary.active_jobs > 0 && (summary.total_applications ?? 0) === 0) {
    insights.push({ type: "warning", message: "Active jobs have no applications yet" });
  }

  return insights;
}
