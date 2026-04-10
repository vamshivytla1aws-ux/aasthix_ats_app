import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { createStickyNoteSchema } from "@/lib/pipelineStickyNotes/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requirePermission("pipeline.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const res = await query(
      `
      SELECT
        n.id,
        n.author_user_id,
        u.full_name AS author_name,
        n.content,
        n.color,
        n.pos_x,
        n.pos_y,
        n.z_index,
        n.is_pinned,
        n.visibility,
        n.board_column,
        n.created_at,
        n.updated_at
      FROM pipeline_board_sticky_notes n
      JOIN users u ON u.id = n.author_user_id
      ORDER BY
        CASE n.board_column
          WHEN 'follow_up' THEN 0
          WHEN 'team_sync' THEN 1
          WHEN 'done' THEN 2
          ELSE 3
        END,
        n.is_pinned DESC,
        n.updated_at DESC
      `
    );

    return NextResponse.json({ notes: res.rows });
  } catch (e) {
    console.error("GET /api/pipeline/sticky-notes", e);
    return NextResponse.json({ error: "Failed to load sticky notes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const raw = await request.json().catch(() => ({}));
    const parsed = createStickyNoteSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const d = parsed.data;

    const ins = await query(
      `
      INSERT INTO pipeline_board_sticky_notes (
        author_user_id,
        content,
        color,
        pos_x,
        pos_y,
        z_index,
        is_pinned,
        visibility,
        board_column
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING
        id,
        author_user_id,
        content,
        color,
        pos_x,
        pos_y,
        z_index,
        is_pinned,
        visibility,
        board_column,
        created_at,
        updated_at
      `,
      [
        user.user_id,
        d.content,
        d.color,
        d.pos_x,
        d.pos_y,
        d.z_index,
        d.is_pinned,
        d.visibility,
        d.board_column,
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
    console.error("POST /api/pipeline/sticky-notes", e);
    return NextResponse.json({ error: "Failed to create sticky note" }, { status: 500 });
  }
}
