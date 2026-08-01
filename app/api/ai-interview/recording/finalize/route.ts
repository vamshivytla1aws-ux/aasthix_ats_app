import { NextResponse } from "next/server";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";
import { finalizeRecording } from "@/lib/aiInterviews/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const interview = await requireCandidateInterview();
  if (!interview) return NextResponse.json({ error: "Interview session is invalid" }, { status: 401 });
  const body = await request.json();
  try {
    const recording = await finalizeRecording({ interviewId:Number(interview.id),uploadId:String(body?.upload_id||""),mimeType:String(body?.mime_type||"video/webm"),durationSeconds:Number(body?.duration_seconds||0) });
    return NextResponse.json({ finalized:true,size:recording.size });
  } catch (error) { return NextResponse.json({ error:error instanceof Error?error.message:"Recording finalization failed" }, { status:400 }); }
}
