import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { patchStickyNoteSchema } from "@/lib/pipelineStickyNotes/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NoteRow = {
  id: number;
  job_id: number;
  author_user_id: number;
  visibility: string;
};

async function loadNote(noteId: number, jobId: number): Promise<NoteRow | null> {
  const r = await query(
    `SELECT id, job_id, author_user_id, visibility FROM pipeline_sticky_notes WHERE id = $1 AND job_id = $2 LIMIT 1`,
    [noteId, jobId]
  );
  return (r.rows[0] as NoteRow | undefined) ?? null;
}

function canMutateNote(user: { user_id: number; role: string }, note: NoteRow): boolean {
  if (user.role === "admin") return true;
  if (note.visibility === "private") return note.author_user_id === user.user_id;
  return true;
}

export async function PATCH(
  request: Request,
  context: { params: { id: string; noteId: string } }
) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const jobId = Number(context.params.id);
    const noteId = Number(context.params.noteId);
    if (!Number.isFinite(jobId) || jobId <= 0 || !Number.isFinite(noteId) || noteId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const note = await loadNote(noteId, jobId);
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    if (!canMutateNote(user, note)) {
      return NextResponse.json({ error: "You can only edit your own private notes." }, { status: 403 });
    }

    const raw = await request.json().catch(() => ({}));
    const parsed = patchStickyNoteSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const p = parsed.data;
    if (Object.keys(p).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    if (p.content !== undefined) {
      sets.push(`content = $${i++}`);
      vals.push(p.content);
    }
    if (p.color !== undefined) {
      sets.push(`color = $${i++}`);
      vals.push(p.color);
    }
    if (p.pos_x !== undefined) {
      sets.push(`pos_x = $${i++}`);
      vals.push(p.pos_x);
    }
    if (p.pos_y !== undefined) {
      sets.push(`pos_y = $${i++}`);
      vals.push(p.pos_y);
    }
    if (p.z_index !== undefined) {
      sets.push(`z_index = $${i++}`);
      vals.push(p.z_index);
    }
    if (p.is_pinned !== undefined) {
      sets.push(`is_pinned = $${i++}`);
      vals.push(p.is_pinned);
    }
    if (p.visibility !== undefined) {
      sets.push(`visibility = $${i++}`);
      vals.push(p.visibility);
    }

    sets.push(`updated_at = NOW()`);
    const idPh = i++;
    const jobPh = i++;
    vals.push(noteId, jobId);

    const sql = `
      UPDATE pipeline_sticky_notes
      SET ${sets.join(", ")}
      WHERE id = $${idPh} AND job_id = $${jobPh}
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
    `;

    const res = await query(sql, vals);
    const row = res.rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const nameRes = await query(`SELECT full_name FROM users WHERE id = $1`, [row.author_user_id]);
    const author_name = (nameRes.rows[0] as { full_name?: string } | undefined)?.full_name ?? "";

    return NextResponse.json({ note: { ...row, author_name } });
  } catch (e) {
    console.error("PATCH sticky-notes/[noteId]", e);
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: { id: string; noteId: string } }
) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const jobId = Number(context.params.id);
    const noteId = Number(context.params.noteId);
    if (!Number.isFinite(jobId) || jobId <= 0 || !Number.isFinite(noteId) || noteId <= 0) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const note = await loadNote(noteId, jobId);
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    if (!canMutateNote(user, note)) {
      return NextResponse.json({ error: "You can only delete your own private notes." }, { status: 403 });
    }

    const del = await query(`DELETE FROM pipeline_sticky_notes WHERE id = $1 AND job_id = $2 RETURNING id`, [
      noteId,
      jobId,
    ]);
    if (del.rowCount === 0) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: noteId });
  } catch (e) {
    console.error("DELETE sticky-notes/[noteId]", e);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
