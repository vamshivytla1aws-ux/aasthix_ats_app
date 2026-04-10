import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { createStickyNoteSchema } from "@/lib/pipelineStickyNotes/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function jobExists(jobId: number): Promise<boolean> {
  const r = await query(`SELECT 1 FROM jobs WHERE id = $1 LIMIT 1`, [jobId]);
  return r.rows.length > 0;
}

export async function GET(_request: Request, context: { params: { id: string } }) {
  try {
    const auth = await requirePermission("pipeline.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const jobId = Number(context.params.id);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    if (!(await jobExists(jobId))) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const res = await query(
      `
      SELECT
        n.id,
        n.job_id,
        n.author_user_id,
        u.full_name AS author_name,
        n.content,
        n.color,
        n.pos_x,
        n.pos_y,
        n.z_index,
        n.is_pinned,
        n.visibility,
        n.created_at,
        n.updated_at
      FROM pipeline_sticky_notes n
      JOIN users u ON u.id = n.author_user_id
      WHERE n.job_id = $1
        AND (n.visibility = 'team' OR n.author_user_id = $2)
      ORDER BY n.is_pinned DESC, n.updated_at DESC
      `,
      [jobId, user.user_id]
    );

    return NextResponse.json({ notes: res.rows });
  } catch (e) {
    console.error("GET /api/jobs/[id]/sticky-notes", e);
    return NextResponse.json({ error: "Failed to load sticky notes" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const jobId = Number(context.params.id);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    if (!(await jobExists(jobId))) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const raw = await request.json().catch(() => ({}));
    const parsed = createStickyNoteSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    const ins = await query(
      `
      INSERT INTO pipeline_sticky_notes (
        job_id,
        author_user_id,
        content,
        color,
        pos_x,
        pos_y,
        z_index,
        is_pinned,
        visibility
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id,
        job_id,
        author_user_id,
        content,
        color,
        pos_x,
        pos_y,
        z_index,
        is_pinned,
        visibility,
        created_at,
        updated_at
      `,
      [
        jobId,
        user.user_id,
        d.content,
        d.color,
        d.pos_x,
        d.pos_y,
        d.z_index,
        d.is_pinned,
        d.visibility,
      ]
    );

    const row = ins.rows[0] as Record<string, unknown>;
    const nameRes = await query(`SELECT full_name FROM users WHERE id = $1`, [user.user_id]);
    const author_name = (nameRes.rows[0] as { full_name?: string } | undefined)?.full_name ?? "";

    return NextResponse.json({
      note: {
        ...row,
        author_name,
      },
    });
  } catch (e) {
    console.error("POST /api/jobs/[id]/sticky-notes", e);
    return NextResponse.json({ error: "Failed to create sticky note" }, { status: 500 });
  }
}
