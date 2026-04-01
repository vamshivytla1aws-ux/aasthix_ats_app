import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthAccess } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=term&limit=10
 * Omnisearch across candidates, jobs, and applications.
 * Returns categorized results for the global header search.
 */
export async function GET(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(Number(searchParams.get("limit")) || 6, 20);
    const scopeRaw = (searchParams.get("scope") ?? "all").toLowerCase();
    const scope =
      scopeRaw === "candidates" || scopeRaw === "jobs" || scopeRaw === "applications" ? scopeRaw : "all";

    if (q.length < 2) {
      return NextResponse.json({ candidates: [], jobs: [], applications: [] });
    }

    const isAdmin = access.role === "admin";
    const canCandidates = isAdmin || access.permissions["candidates.view"] !== false;
    const canJobs = isAdmin || access.permissions["jobs.view"] !== false;
    const canPipeline = isAdmin || access.permissions["pipeline.view"] !== false;

    const wantCandidates = (scope === "all" || scope === "candidates") && canCandidates;
    const wantJobs = (scope === "all" || scope === "jobs") && canJobs;
    const wantApplications = (scope === "all" || scope === "applications") && canPipeline;

    const uid = access.user_id;
    const pattern = `%${q}%`;

    let hasTeamTable = false;
    try {
      await query(`SELECT 1 FROM job_team LIMIT 0`, []);
      hasTeamTable = true;
    } catch { /* not migrated */ }

    // Candidates — no `candidates.status` column; mirror profile API (Placed if any Selected application).
    const candParams: (string | number)[] = isAdmin ? [pattern, limit] : [uid, pattern, limit];
    const candWhere = isAdmin ? "TRUE" : `c.created_by_user_id = $1`;
    const candPatIdx = isAdmin ? 1 : 2;
    const candLimIdx = isAdmin ? 2 : 3;
    const placedSql = isAdmin
      ? `EXISTS (SELECT 1 FROM applications ax WHERE ax.candidate_id = c.id AND ax.stage = 'Selected')`
      : `EXISTS (SELECT 1 FROM applications ax WHERE ax.candidate_id = c.id AND ax.created_by_user_id = $1 AND ax.stage = 'Selected')`;
    const candidates = wantCandidates
      ? await query(
          `SELECT c.id, c.full_name, c.email, c.location,
                  CASE WHEN ${placedSql} THEN 'Placed' ELSE 'Active' END AS status
           FROM candidates c
           WHERE ${candWhere}
             AND (
               c.full_name ILIKE $${candPatIdx}
               OR COALESCE(c.email, '') ILIKE $${candPatIdx}
               OR COALESCE(c.location, '') ILIKE $${candPatIdx}
               OR COALESCE(c.phone, '') ILIKE $${candPatIdx}
             )
           ORDER BY c.updated_at DESC NULLS LAST
           LIMIT $${candLimIdx}`,
          candParams
        )
      : { rows: [] };

    // Jobs
    const jobOwnerOrTeam = hasTeamTable
      ? `(j.created_by_user_id = $1 OR EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = j.id AND jt.user_id = $1))`
      : `j.created_by_user_id = $1`;
    const jobWhere = isAdmin ? "TRUE" : jobOwnerOrTeam;
    const jobParams: (string | number)[] = isAdmin ? [pattern, limit] : [uid, pattern, limit];
    const jobPatIdx = isAdmin ? 1 : 2;
    const jobLimIdx = isAdmin ? 2 : 3;
    const jobs = wantJobs
      ? await query(
          `SELECT j.id, j.title, j.company, j.status, j.location
           FROM jobs j
           WHERE ${jobWhere}
             AND (j.title ILIKE $${jobPatIdx} OR j.company ILIKE $${jobPatIdx} OR j.location ILIKE $${jobPatIdx})
           ORDER BY j.updated_at DESC NULLS LAST
           LIMIT $${jobLimIdx}`,
          jobParams
        )
      : { rows: [] };

    // Applications (join candidate + job for rich results)
    const appOwnerOrTeam = hasTeamTable
      ? `(a.created_by_user_id = $1 OR EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = a.job_id AND jt.user_id = $1))`
      : `a.created_by_user_id = $1`;
    const appWhere = isAdmin ? "TRUE" : appOwnerOrTeam;
    const appParams: (string | number)[] = isAdmin ? [pattern, limit] : [uid, pattern, limit];
    const appPatIdx = isAdmin ? 1 : 2;
    const appLimIdx = isAdmin ? 2 : 3;
    const applications = wantApplications
      ? await query(
          `SELECT a.id, a.stage, a.created_at,
                  c.full_name AS candidate_name, c.id AS candidate_id,
                  j.title AS job_title, j.id AS job_id
           FROM applications a
           JOIN candidates c ON c.id = a.candidate_id
           JOIN jobs j ON j.id = a.job_id
           WHERE ${appWhere}
             AND (c.full_name ILIKE $${appPatIdx} OR j.title ILIKE $${appPatIdx})
           ORDER BY a.updated_at DESC NULLS LAST
           LIMIT $${appLimIdx}`,
          appParams
        )
      : { rows: [] };

    return NextResponse.json({
      candidates: candidates.rows,
      jobs: jobs.rows,
      applications: applications.rows,
    });
  } catch (error) {
    console.error("search GET", error);
    return NextResponse.json({ candidates: [], jobs: [], applications: [] });
  }
}
