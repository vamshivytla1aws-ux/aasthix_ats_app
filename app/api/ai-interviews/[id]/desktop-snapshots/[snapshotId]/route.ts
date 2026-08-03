import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { canAccessAiInterview } from "@/lib/aiInterviews/access";
import { getSnapshotStat } from "@/lib/aiInterviews/storage";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; snapshotId: string }> },
) {
  const { id, snapshotId } = await context.params;
  const interviewId = Number(id);
  const auth = await requirePermission("ai_interviews.review");
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await canAccessAiInterview(auth.access, interviewId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await query(
    `SELECT snapshot_path, snapshot_mime_type FROM ai_interview_desktop_snapshots WHERE id=$1 AND interview_id=$2`,
    [Number(snapshotId), interviewId]
  );
  if (!result.rowCount) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  const { snapshot_path, snapshot_mime_type } = result.rows[0];
  try {
    const { path, stat } = await getSnapshotStat(snapshot_path);
    const file = await fs.readFile(path);
    return new NextResponse(file, {
      headers: {
        "Content-Type": String(snapshot_mime_type),
        "Content-Length": stat.size.toString(),
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    console.error("[ai-interviews] desktop snapshot read error", error);
    return NextResponse.json({ error: "Snapshot file is unavailable" }, { status: 404 });
  }
}
