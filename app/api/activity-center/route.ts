import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ActivityCenterRow = {
  id: string;
  activity: string;
  type: string;
  candidate: string;
  job: string;
  recruiter: string;
  date: string;
  priority: "High" | "Medium" | "Low";
  link: string | null;
};

function fmt(d: string | null | undefined) {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  try {
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(x);
  } catch {
    return x.toISOString();
  }
}

export async function GET() {
  try {
    const auth = await requirePermission("dashboard.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;
    const recruiter = user.email?.split("@")[0] || "You";

    let hasTeamTable = false;
    try {
      await query(`SELECT 1 FROM job_team LIMIT 0`, []);
      hasTeamTable = true;
    } catch {
      // job_team not migrated yet — owner-only queries
    }

    const teamOrOwnerApp = hasTeamTable
      ? `(app.created_by_user_id = $1 OR EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = app.job_id AND jt.user_id = $1))`
      : `app.created_by_user_id = $1`;
    const teamOrOwnerJob = hasTeamTable
      ? `(j.created_by_user_id = $1 OR EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = j.id AND jt.user_id = $1))`
      : `j.created_by_user_id = $1`;

    const rows: ActivityCenterRow[] = [];

    const unreadAlerts = await query(
      `
      SELECT
        al.id,
        al.message,
        al.type,
        al.created_at,
        c.full_name AS candidate_name,
        j.title AS job_title,
        app.candidate_id
      FROM alerts al
      JOIN applications app ON app.id = al.application_id
      JOIN candidates c ON c.id = app.candidate_id
      JOIN jobs j ON j.id = app.job_id
      WHERE al.user_id = $1
        AND al.status = 'unread'
        AND (al.expires_at IS NULL OR al.expires_at > NOW())
        AND ${teamOrOwnerApp}
      ORDER BY al.created_at DESC
      LIMIT 20
      `,
      [user.user_id]
    );

    for (const r of unreadAlerts.rows as Array<{
      id: number;
      message: string;
      type: string;
      created_at: string;
      candidate_name: string;
      job_title: string;
      candidate_id: number;
    }>) {
      rows.push({
        id: `alert-${r.id}`,
        activity: r.message,
        type: "Alert",
        candidate: r.candidate_name || "—",
        job: r.job_title || "—",
        recruiter,
        date: fmt(r.created_at),
        priority: "High",
        link: r.candidate_id ? `/candidates/${r.candidate_id}` : null,
      });
    }

    const screening = await query(
      `
      SELECT
        a.id,
        c.full_name AS candidate_name,
        j.title AS job_title,
        a.updated_at,
        a.candidate_id
      FROM applications a
      JOIN candidates c ON c.id = a.candidate_id
      JOIN jobs j ON j.id = a.job_id
      WHERE ${teamOrOwnerApp.replace(/\bapp\b/g, "a")}
        AND a.stage = 'Screening'
      ORDER BY a.updated_at ASC NULLS LAST
      LIMIT 25
      `,
      [user.user_id]
    );

    for (const r of screening.rows as Array<{
      id: number;
      candidate_name: string;
      job_title: string;
      updated_at: string;
      candidate_id: number;
    }>) {
      rows.push({
        id: `screening-${r.id}`,
        activity: "Complete screening review",
        type: "Screening",
        candidate: r.candidate_name || "—",
        job: r.job_title || "—",
        recruiter,
        date: fmt(r.updated_at),
        priority: "Medium",
        link: `/candidates/${r.candidate_id}`,
      });
    }

    const interviewFollowups = await query(
      `
      SELECT
        a.id,
        c.full_name AS candidate_name,
        j.title AS job_title,
        a.interview_datetime,
        a.candidate_id
      FROM applications a
      JOIN candidates c ON c.id = a.candidate_id
      JOIN jobs j ON j.id = a.job_id
      WHERE ${teamOrOwnerApp.replace(/\bapp\b/g, "a")}
        AND a.stage = 'Interview'
        AND a.interview_scheduled = true
        AND a.interview_datetime IS NOT NULL
        AND a.interview_datetime < NOW()
        AND a.interview_datetime > NOW() - INTERVAL '14 days'
      ORDER BY a.interview_datetime DESC
      LIMIT 20
      `,
      [user.user_id]
    );

    for (const r of interviewFollowups.rows as Array<{
      id: number;
      candidate_name: string;
      job_title: string;
      interview_datetime: string;
      candidate_id: number;
    }>) {
      rows.push({
        id: `interview-${r.id}`,
        activity: "Interview follow-up — capture feedback / next steps",
        type: "Interview",
        candidate: r.candidate_name || "—",
        job: r.job_title || "—",
        recruiter,
        date: fmt(r.interview_datetime),
        priority: "High",
        link: `/interviews`,
      });
    }

    const emptyJobs = await query(
      `
      SELECT j.id, j.title, j.company, j.created_at
      FROM jobs j
      LEFT JOIN applications a ON a.job_id = j.id
      WHERE ${teamOrOwnerJob}
      GROUP BY j.id, j.title, j.company, j.created_at
      HAVING COUNT(a.id) = 0
      ORDER BY j.created_at DESC
      LIMIT 15
      `,
      [user.user_id]
    );

    for (const r of emptyJobs.rows as Array<{
      id: number;
      title: string;
      company: string;
      created_at: string;
    }>) {
      rows.push({
        id: `job-empty-${r.id}`,
        activity: "No applications yet — promote role or source candidates",
        type: "Pipeline",
        candidate: "—",
        job: `${r.title} (${r.company})`,
        recruiter,
        date: fmt(r.created_at),
        priority: "Low",
        link: `/jobs/${r.id}`,
      });
    }

    const pr = { High: 0, Medium: 1, Low: 2 };
    rows.sort((a, b) => {
      const d = pr[a.priority] - pr[b.priority];
      if (d !== 0) return d;
      return a.id.localeCompare(b.id);
    });

    return NextResponse.json({ activities: rows });
  } catch (error) {
    console.error("activity-center GET", error);
    return NextResponse.json({ error: "Failed to load activity center" }, { status: 500 });
  }
}
