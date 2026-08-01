import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { canAccessAiInterview } from "@/lib/aiInterviews/access";
import { getSnapshotStat } from "@/lib/aiInterviews/storage";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await requirePermission("ai_interviews.review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await canAccessAiInterview(auth.access, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await query(`SELECT snapshot_path,snapshot_mime_type,snapshot_status FROM ai_interviews WHERE id=$1`, [id]);
  const row = result.rows[0];
  if (!row?.snapshot_path || row.snapshot_status !== "CAPTURED") return NextResponse.json({ error: "Interview snapshot is unavailable" }, { status: 404 });
  try {
    const media = await getSnapshotStat(String(row.snapshot_path));
    const download = new URL(request.url).searchParams.get("download") === "1";
    const stream = fs.createReadStream(media.path);
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": row.snapshot_mime_type || "image/jpeg",
        "Content-Length": String(media.stat.size),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="ai-interview-${id}-candidate.jpg"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Interview snapshot file is unavailable" }, { status: 404 });
  }
}
