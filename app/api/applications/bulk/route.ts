import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";

/**
 * Add multiple candidates to the same job (pipeline) in one request.
 */
export async function POST(request: Request) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const body = await request.json();
    const { candidate_ids, job_id } = body as { candidate_ids?: unknown; job_id?: unknown };

    const jid = typeof job_id === "number" ? job_id : Number(job_id);
    if (!Number.isFinite(jid) || jid <= 0) {
      return NextResponse.json({ error: "job_id is required" }, { status: 400 });
    }

    const raw = Array.isArray(candidate_ids) ? candidate_ids : [];
    const ids = Array.from(new Set(raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)));
    if (ids.length === 0) {
      return NextResponse.json({ error: "candidate_ids must be a non-empty array" }, { status: 400 });
    }
    if (ids.length > 200) {
      return NextResponse.json({ error: "Too many candidates (max 200)" }, { status: 400 });
    }

    const jobCheck = await query(
      `SELECT id FROM jobs WHERE id = $1 LIMIT 1`,
      [jid]
    );
    if (jobCheck.rowCount === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const result = await query(
      `
      INSERT INTO applications (candidate_id, job_id, stage, status, updated_at, created_by_user_id, source)
      SELECT u.cid, $1, 'Applied', 'Applied', NOW(), $2, 'bulk'
      FROM unnest($3::bigint[]) AS u(cid)
      ON CONFLICT (candidate_id, job_id) DO UPDATE SET
        updated_at = NOW()
      RETURNING id, candidate_id
      `,
      [jid, user.user_id, ids]
    );

    return NextResponse.json({
      ok: true,
      job_id: jid,
      created_or_touched: result.rows.length,
      rows: result.rows,
    });
  } catch (error) {
    console.error("applications/bulk POST", error);
    return NextResponse.json({ error: "Failed to add applications" }, { status: 500 });
  }
}
