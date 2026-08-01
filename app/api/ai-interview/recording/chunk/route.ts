import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";
import { storeRecordingChunk } from "@/lib/aiInterviews/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const interview = await requireCandidateInterview();
  if (!interview) return NextResponse.json({ error: "Interview session is invalid" }, { status: 401 });
  if (!interview.recording_enabled) return NextResponse.json({ error: "Recording is disabled" }, { status: 409 });
  const uploadId = String(request.headers.get("x-upload-id")||"");
  const sequence = Number(request.headers.get("x-chunk-sequence"));
  if (!Number.isInteger(sequence) || sequence<0) return NextResponse.json({ error: "Invalid chunk sequence" }, { status: 400 });
  try {
    const stored = await storeRecordingChunk({ interviewId:Number(interview.id),uploadId,sequence,bytes:Buffer.from(await request.arrayBuffer()) });
    await query(`UPDATE ai_interviews SET video_status='UPLOADING',updated_at=NOW() WHERE id=$1`, [interview.id]);
    return NextResponse.json(stored);
  } catch (error) { return NextResponse.json({ error:error instanceof Error?error.message:"Chunk upload failed" }, { status:400 }); }
}
