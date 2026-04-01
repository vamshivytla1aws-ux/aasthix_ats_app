import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { isJobTeamRole, type JobTeamRow } from "@/lib/jobTeam";

/**
 * GET  /api/job-team?job_id=N          — list team members for a job
 * GET  /api/job-team?user_id=N         — list jobs a user is on the team of
 * POST /api/job-team { job_id, user_id, role }  — add member
 * DELETE /api/job-team { id } or { job_id, user_id, role }  — remove member
 */

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("job_id");
    const userId = searchParams.get("user_id");

    const vals: unknown[] = [];
    const wheres: string[] = [];

    if (jobId && Number.isFinite(Number(jobId))) {
      vals.push(Number(jobId));
      wheres.push(`jt.job_id = $${vals.length}`);
    }
    if (userId && Number.isFinite(Number(userId))) {
      vals.push(Number(userId));
      wheres.push(`jt.user_id = $${vals.length}`);
    }

    const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";

    const res = await query(
      `SELECT jt.id, jt.job_id, jt.user_id, jt.role, jt.created_at,
              u.email AS user_email, u.full_name AS user_name,
              j.title AS job_title
       FROM job_team jt
       JOIN users u ON u.id = jt.user_id
       JOIN jobs j ON j.id = jt.job_id
       ${whereClause}
       ORDER BY jt.job_id, jt.role, jt.created_at`,
      vals
    );

    return NextResponse.json({ members: res.rows });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "42P01") {
      return NextResponse.json({ members: [] });
    }
    console.error("job-team GET", e);
    return NextResponse.json({ error: "Failed to list team" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { job_id, user_id, role } = body as {
      job_id?: number;
      user_id?: number;
      role?: string;
    };

    if (!job_id || !Number.isFinite(job_id)) {
      return NextResponse.json({ error: "job_id is required" }, { status: 400 });
    }
    if (!user_id || !Number.isFinite(user_id)) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }
    if (!role || !isJobTeamRole(role)) {
      return NextResponse.json(
        { error: "role must be one of: hiring_manager, recruiter, coordinator, sourcer, observer" },
        { status: 400 }
      );
    }

    const jobCheck = await query(`SELECT id FROM jobs WHERE id = $1 LIMIT 1`, [job_id]);
    if (!jobCheck.rowCount) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    const userCheck = await query(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [user_id]);
    if (!userCheck.rowCount) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const res = await query(
      `INSERT INTO job_team (job_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (job_id, user_id, role) DO NOTHING
       RETURNING id, job_id, user_id, role, created_at`,
      [job_id, user_id, role]
    );

    if (!res.rowCount) {
      const existing = await query(
        `SELECT id, job_id, user_id, role, created_at FROM job_team
         WHERE job_id = $1 AND user_id = $2 AND role = $3 LIMIT 1`,
        [job_id, user_id, role]
      );
      return NextResponse.json(existing.rows[0] as JobTeamRow);
    }

    return NextResponse.json(res.rows[0], { status: 201 });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "42P01") {
      return NextResponse.json(
        { error: "job_team table not found — run migration 0040_job_team.sql" },
        { status: 500 }
      );
    }
    console.error("job-team POST", e);
    return NextResponse.json({ error: "Failed to add team member" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { id, job_id, user_id, role } = body as {
      id?: number;
      job_id?: number;
      user_id?: number;
      role?: string;
    };

    let res;
    if (id && Number.isFinite(id)) {
      res = await query(`DELETE FROM job_team WHERE id = $1 RETURNING id`, [id]);
    } else if (job_id && user_id && role) {
      res = await query(
        `DELETE FROM job_team WHERE job_id = $1 AND user_id = $2 AND role = $3 RETURNING id`,
        [job_id, user_id, role]
      );
    } else {
      return NextResponse.json(
        { error: "Provide id, or job_id + user_id + role" },
        { status: 400 }
      );
    }

    if (!res.rowCount) {
      return NextResponse.json({ error: "Team member not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "42P01") {
      return NextResponse.json({ error: "job_team table not found" }, { status: 500 });
    }
    console.error("job-team DELETE", e);
    return NextResponse.json({ error: "Failed to remove team member" }, { status: 500 });
  }
}
