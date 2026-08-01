import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { canAccessAiInterview } from "@/lib/aiInterviews/access";
import { getRecordingStat } from "@/lib/aiInterviews/storage";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await requirePermission("ai_interviews.review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await canAccessAiInterview(auth.access, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await query(`SELECT recording_path,recording_mime_type,video_status FROM ai_interviews WHERE id=$1`, [id]);
  const row = result.rows[0];
  if (!row?.recording_path || row.video_status !== "UPLOADED") return NextResponse.json({ error: "Recording is unavailable" }, { status: 404 });
  try {
    const media = await getRecordingStat(String(row.recording_path));
    const range = request.headers.get("range");
    let start = 0; let end = media.stat.size - 1; let status = 200;
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      if (match) { start=Number(match[1]); end=match[2] ? Math.min(Number(match[2]),end) : end; status=206; }
    }
    const stream = fs.createReadStream(media.path, { start, end });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status,
      headers: {
        "Content-Type": row.recording_mime_type || "video/webm",
        "Content-Length": String(end-start+1),
        "Accept-Ranges": "bytes",
        ...(status===206 ? { "Content-Range": `bytes ${start}-${end}/${media.stat.size}` } : {}),
        "Cache-Control": "private, no-store",
      },
    });
  } catch { return NextResponse.json({ error: "Recording file is unavailable" }, { status: 404 }); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await requirePermission("ai_interviews.delete_recording");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await canAccessAiInterview(auth.access, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await query(`SELECT recording_path FROM ai_interviews WHERE id=$1`, [id]);
  const path = result.rows[0]?.recording_path;
  if (path) { const { path: safePath } = await getRecordingStat(String(path)); await fs.promises.rm(safePath, { force: true }); }
  await query(`UPDATE ai_interviews SET video_status='DELETED_BY_RECRUITER',recording_path=NULL,recording_size=NULL,updated_at=NOW() WHERE id=$1`, [id]);
  await query(`INSERT INTO ai_interview_audit_events (interview_id,actor_user_id,event_type) VALUES ($1,$2,'RECORDING_DELETED')`, [id,auth.access.user_id]);
  return NextResponse.json({ deleted: true });
}
