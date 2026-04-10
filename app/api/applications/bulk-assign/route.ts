import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { applicationAccessPredicate, hasJobTeamTable } from "@/lib/applicationVisibility";

export const runtime = "nodejs";

/**
 * POST { application_ids: number[], assigned_recruiter_user_id: number | null }
 */
export async function POST(request: Request) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const body = await request.json();
    const raw = Array.isArray(body?.application_ids) ? body.application_ids : [];
    const ids: number[] = Array.from(
      new Set(
        raw
          .map((x: unknown) => Number(x))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      )
    );
    if (ids.length === 0) {
      return NextResponse.json({ error: "application_ids must be a non-empty array" }, { status: 400 });
    }
    if (ids.length > 100) {
      return NextResponse.json({ error: "Too many applications (max 100)" }, { status: 400 });
    }

    let rid: number | null = null;
    if (body?.assigned_recruiter_user_id !== undefined && body?.assigned_recruiter_user_id !== null) {
      rid = Number(body.assigned_recruiter_user_id);
      if (!Number.isFinite(rid) || rid <= 0) {
        return NextResponse.json({ error: "Invalid assigned_recruiter_user_id" }, { status: 400 });
      }
      const uchk = await query(`SELECT 1 FROM users WHERE id = $1`, [rid]);
      if (!uchk.rowCount) {
        return NextResponse.json({ error: "User not found" }, { status: 400 });
      }
    } else if (body?.assigned_recruiter_user_id === null) {
      rid = null;
    } else {
      return NextResponse.json({ error: "assigned_recruiter_user_id is required (use null to clear)" }, { status: 400 });
    }

    const hasTeam = await hasJobTeamTable();
    const access = applicationAccessPredicate("applications", "$2", hasTeam);

    const upd = await query(
      `
      UPDATE applications
      SET assigned_recruiter_user_id = $3, updated_at = NOW()
      WHERE id = ANY($1::bigint[])
        AND (${access})
      `,
      [ids, user.user_id, rid]
    );

    return NextResponse.json({
      ok: true,
      updated: upd.rowCount ?? 0,
    });
  } catch (e) {
    console.error("applications/bulk-assign", e);
    return NextResponse.json({ error: "Bulk assign failed" }, { status: 500 });
  }
}
