import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GDPR-style data export (JSON) and erasure for a candidate record.
 * Jurisdiction-specific legal review is still required before production use.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("candidates.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const candidateId = Number(params.id);
    if (!Number.isFinite(candidateId) || candidateId <= 0) {
      return NextResponse.json({ error: "Invalid candidate id" }, { status: 400 });
    }

    const cRes = await query(`SELECT * FROM candidates WHERE id = $1`, [candidateId]);
    if (cRes.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const apps = await query(
      `
      SELECT a.*, j.title AS job_title, j.company AS job_company
      FROM applications a
      LEFT JOIN jobs j ON j.id = a.job_id
      WHERE a.candidate_id = $1
      ORDER BY a.id
      `,
      [candidateId]
    );

    const notes = await query(
      `SELECT id, note, created_at FROM candidate_notes WHERE candidate_id = $1 ORDER BY id`,
      [candidateId]
    ).catch(() => ({ rows: [] }));

    const payload = {
      exported_at: new Date().toISOString(),
      candidate: cRes.rows[0],
      applications: apps.rows,
      notes: notes.rows,
    };

    try {
      await query(
        `
        INSERT INTO gdpr_candidate_requests (candidate_id, requested_by_user_id, kind, status, metadata)
        VALUES ($1, $2, 'export', 'completed', $3::jsonb)
        `,
        [candidateId, user.user_id, JSON.stringify({ format: "json" })]
      );
    } catch {
      /* table may not exist pre-migration */
    }

    await writeAuditLog({
      actorUserId: user.user_id,
      action: "candidates.gdpr.export",
      metadata: { candidate_id: candidateId },
    });

    return NextResponse.json(payload);
  } catch (e) {
    console.error("gdpr GET", e);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("candidates.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const candidateId = Number(params.id);
    if (!Number.isFinite(candidateId) || candidateId <= 0) {
      return NextResponse.json({ error: "Invalid candidate id" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    if (String(body?.confirm || "") !== "ERASE") {
      return NextResponse.json(
        { error: 'Body must include { "confirm": "ERASE" } to permanently delete PII.' },
        { status: 400 }
      );
    }

    await query(`DELETE FROM applications WHERE candidate_id = $1`, [candidateId]);
    const del = await query(`DELETE FROM candidates WHERE id = $1 RETURNING id`, [candidateId]);
    if (del.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

    try {
      await query(
        `
        INSERT INTO gdpr_candidate_requests (candidate_id, requested_by_user_id, kind, status, metadata)
        VALUES ($1, $2, 'erase', 'completed', '{}'::jsonb)
        `,
        [candidateId, user.user_id]
      );
    } catch {
      /* optional table */
    }

    await writeAuditLog({
      actorUserId: user.user_id,
      action: "candidates.gdpr.erase",
      metadata: { candidate_id: candidateId },
    });

    return NextResponse.json({ ok: true, erased_candidate_id: candidateId });
  } catch (e) {
    console.error("gdpr POST", e);
    return NextResponse.json({ error: "Erasure failed" }, { status: 500 });
  }
}
