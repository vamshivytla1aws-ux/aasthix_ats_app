import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthAccess } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/recruiter/workload
 *
 * Returns per-recruiter workload rows for lead recruiters / admins.
 * - Admins and users with hiring_manager.view see all recruiters.
 * - Others see only their own row.
 *
 * Workload attribution (when `applications.assigned_recruiter_user_id` exists, migration 0050):
 * - Job owner or job_team member: all applications on that job count toward them.
 * - Otherwise: only applications with assigned_recruiter_user_id = that user (and the job appears if they have ≥1).
 *
 * Optional query param: ?user_id=N to drill into a single recruiter's JDs.
 */

type RecruiterRow = {
  user_id: number;
  email: string;
  full_name: string;
  assigned_jds: number;
  active_jds: number;
  total_applications: number;
  applied: number;
  screening: number;
  interview: number;
  selected: number;
  rejected: number;
  interviews_this_week: number;
  last_activity_at: string | null;
};

type RecruiterJobRow = {
  job_id: number;
  title: string;
  company: string;
  status: string;
  total_applications: number;
  applied: number;
  screening: number;
  interview: number;
  selected: number;
  rejected: number;
  last_activity_at: string | null;
  team_role: string;
};

async function detectJobTeamTable(): Promise<boolean> {
  try {
    await query(`SELECT 1 FROM job_team LIMIT 0`, []);
    return true;
  } catch {
    return false;
  }
}

async function detectAssignedRecruiterColumn(): Promise<boolean> {
  try {
    await query(`SELECT assigned_recruiter_user_id FROM applications LIMIT 0`, []);
    return true;
  } catch {
    return false;
  }
}

function ownerOrTeamSql(hasTeamTable: boolean): string {
  return hasTeamTable
    ? `(j.created_by_user_id = $1 OR EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = j.id AND jt.user_id = $1))`
    : `j.created_by_user_id = $1`;
}

/** Jobs that should appear in this recruiter's workload. */
function jobInScopeSql(hasTeamTable: boolean, useAssignedRecruiter: boolean): string {
  const own = ownerOrTeamSql(hasTeamTable);
  if (!useAssignedRecruiter) return own;
  return `${own} OR EXISTS (SELECT 1 FROM applications a_scope WHERE a_scope.job_id = j.id AND a_scope.assigned_recruiter_user_id = $1)`;
}

/** Applications that count toward this recruiter's metrics for a given job row j. */
function applicationMatchesRecruiterSql(hasTeamTable: boolean, useAssignedRecruiter: boolean): string {
  const own = ownerOrTeamSql(hasTeamTable);
  if (!useAssignedRecruiter) return `TRUE`;
  return `(${own} OR a.assigned_recruiter_user_id = $1)`;
}

function teamRoleSelectSql(hasTeamTable: boolean): string {
  if (hasTeamTable) {
    return `CASE
      WHEN j.created_by_user_id = $1 THEN 'owner'
      WHEN EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = j.id AND jt.user_id = $1) THEN
        COALESCE((SELECT jt.role FROM job_team jt WHERE jt.job_id = j.id AND jt.user_id = $1 LIMIT 1), 'recruiter')
      ELSE 'assigned'
    END`;
  }
  return `CASE WHEN j.created_by_user_id = $1 THEN 'owner' ELSE 'assigned' END`;
}

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
    const drillUserId = searchParams.get("user_id");

    const hasTeamTable = await detectJobTeamTable();
    const useAssignedRecruiter = await detectAssignedRecruiterColumn();

    const jobScope = jobInScopeSql(hasTeamTable, useAssignedRecruiter);
    const appMatch = applicationMatchesRecruiterSql(hasTeamTable, useAssignedRecruiter);

    // Drill into a single recruiter's JDs
    if (drillUserId && Number.isFinite(Number(drillUserId))) {
      const uid = Number(drillUserId);
      if (!isLeadOrAdmin && uid !== access.user_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const teamRoleSql = teamRoleSelectSql(hasTeamTable);

      const joinCond = useAssignedRecruiter ? `a.job_id = j.id AND (${appMatch})` : `a.job_id = j.id`;

      const jobsRes = await query(
        `SELECT
           j.id AS job_id,
           j.title,
           j.company,
           j.status,
           COUNT(a.id)::int AS total_applications,
           COUNT(a.id) FILTER (WHERE a.stage = 'Applied')::int AS applied,
           COUNT(a.id) FILTER (WHERE a.stage = 'Screening')::int AS screening,
           COUNT(a.id) FILTER (WHERE a.stage = 'Interview')::int AS interview,
           COUNT(a.id) FILTER (WHERE a.stage = 'Selected')::int AS selected,
           COUNT(a.id) FILTER (WHERE a.stage = 'Rejected')::int AS rejected,
           MAX(a.updated_at) AS last_activity_at,
           ${teamRoleSql} AS team_role
         FROM jobs j
         LEFT JOIN applications a ON ${joinCond}
         WHERE ${jobScope}
         GROUP BY j.id, j.title, j.company, j.status
         ORDER BY j.created_at DESC NULLS LAST`,
        [uid]
      );

      return NextResponse.json({ jobs: jobsRes.rows as RecruiterJobRow[] });
    }

    // Aggregate view: one row per recruiter
    if (!isLeadOrAdmin) {
      const ownRes = await buildRecruiterRow(access.user_id, hasTeamTable, useAssignedRecruiter);
      return NextResponse.json({ recruiters: ownRes ? [ownRes] : [] });
    }

    const usersRes = await query(`SELECT id, full_name, email FROM users ORDER BY full_name, id`);
    const allUsers = usersRes.rows as Array<{ id: number; full_name: string; email: string }>;

    const recruiters: RecruiterRow[] = [];
    for (const u of allUsers) {
      const row = await buildRecruiterRow(u.id, hasTeamTable, useAssignedRecruiter);
      if (row && row.assigned_jds > 0) {
        recruiters.push({ ...row, email: u.email, full_name: u.full_name });
      }
    }

    recruiters.sort((a, b) => b.active_jds - a.active_jds || b.assigned_jds - a.assigned_jds);

    return NextResponse.json({ recruiters });
  } catch (error) {
    console.error("workload GET", error);
    return NextResponse.json({ error: "Failed to load workload" }, { status: 500 });
  }
}

async function buildRecruiterRow(
  userId: number,
  hasTeamTable: boolean,
  useAssignedRecruiter: boolean
): Promise<RecruiterRow | null> {
  const jobScope = jobInScopeSql(hasTeamTable, useAssignedRecruiter);
  const appMatch = applicationMatchesRecruiterSql(hasTeamTable, useAssignedRecruiter);
  const joinCond = useAssignedRecruiter ? `a.job_id = j.id AND (${appMatch})` : `a.job_id = j.id`;

  const res = await query(
    `SELECT
       COUNT(DISTINCT j.id)::int AS assigned_jds,
       COUNT(DISTINCT j.id) FILTER (WHERE LOWER(COALESCE(j.status, 'open')) IN ('open', 'pending approval'))::int AS active_jds,
       COUNT(a.id)::int AS total_applications,
       COUNT(a.id) FILTER (WHERE a.stage = 'Applied')::int AS applied,
       COUNT(a.id) FILTER (WHERE a.stage = 'Screening')::int AS screening,
       COUNT(a.id) FILTER (WHERE a.stage = 'Interview')::int AS interview,
       COUNT(a.id) FILTER (WHERE a.stage = 'Selected')::int AS selected,
       COUNT(a.id) FILTER (WHERE a.stage = 'Rejected')::int AS rejected,
       MAX(a.updated_at) AS last_activity_at
     FROM jobs j
     LEFT JOIN applications a ON ${joinCond}
     WHERE ${jobScope}`,
    [userId]
  );

  const r = res.rows[0] as RecruiterRow | undefined;
  if (!r) return null;

  let interviewsThisWeek = 0;
  try {
    const ownerJ = ownerOrTeamSql(hasTeamTable);
    const appFilter = useAssignedRecruiter
      ? `((${ownerJ}) OR a.assigned_recruiter_user_id = $1)`
      : ownerJ;

    const iwRes = await query(
      `SELECT COUNT(*)::int AS n
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE ${appFilter}
         AND a.stage = 'Interview'
         AND a.interview_scheduled = TRUE
         AND a.interview_datetime >= date_trunc('week', CURRENT_DATE)
         AND a.interview_datetime < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'`,
      [userId]
    );
    interviewsThisWeek = iwRes.rows[0]?.n ?? 0;
  } catch {
    // optional columns
  }

  return {
    user_id: userId,
    email: "",
    full_name: "",
    assigned_jds: r.assigned_jds,
    active_jds: r.active_jds,
    total_applications: r.total_applications,
    applied: r.applied,
    screening: r.screening,
    interview: r.interview,
    selected: r.selected,
    rejected: r.rejected,
    interviews_this_week: interviewsThisWeek,
    last_activity_at: r.last_activity_at,
  };
}
