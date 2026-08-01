import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { canAccessAiInterview } from "@/lib/aiInterviews/access";
import { deleteInterviewMedia } from "@/lib/aiInterviews/storage";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await requirePermission("ai_interviews.delete");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await canAccessAiInterview(auth.access, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await query(`SELECT recording_path,snapshot_path FROM ai_interviews WHERE id=$1`, [id]);
  if (!existing.rowCount) return NextResponse.json({ error: "AI interview not found" }, { status: 404 });
  const row = existing.rows[0];
  const removed = await query(`DELETE FROM ai_interviews WHERE id=$1 RETURNING id`, [id]);
  if (!removed.rowCount) return NextResponse.json({ error: "AI interview could not be deleted" }, { status: 409 });
  await deleteInterviewMedia({ interviewId: id, recordingPath: row.recording_path, snapshotPath: row.snapshot_path });
  return NextResponse.json({ deleted: true });
}
