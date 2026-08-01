import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";
import { storeAnswerAudio } from "@/lib/aiInterviews/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const interview = await requireCandidateInterview();
  if (!interview) return NextResponse.json({ error: "Interview session is invalid" }, { status: 401 });
  if (interview.status !== "IN_PROGRESS") return NextResponse.json({ error: "Interview is not in progress" }, { status: 409 });
  const questionId = Number(request.headers.get("x-question-id"));
  const valid = await query(`SELECT 1 FROM ai_interview_questions WHERE id=$1 AND interview_id=$2`, [questionId, interview.id]);
  if (!valid.rowCount) return NextResponse.json({ error: "Invalid question" }, { status: 400 });
  const mimeType = request.headers.get("content-type")?.split(";")[0]?.trim() || "audio/webm";
  try {
    const audio = await storeAnswerAudio({ interviewId: Number(interview.id), questionId, bytes: Buffer.from(await request.arrayBuffer()), mimeType });
    return NextResponse.json({ uploaded: true, size: audio.size });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Answer audio could not be stored" }, { status: 400 });
  }
}
