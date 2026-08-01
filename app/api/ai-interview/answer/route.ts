import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const interview = await requireCandidateInterview();
  if (!interview) return NextResponse.json({ error: "Interview session is invalid" }, { status: 401 });
  if (interview.status !== "IN_PROGRESS") return NextResponse.json({ error: "Interview is not in progress" }, { status: 409 });
  const body = await request.json();
  const questionId = Number(body?.question_id);
  const valid = await query(`SELECT 1 FROM ai_interview_questions WHERE id=$1 AND interview_id=$2`, [questionId,interview.id]);
  if (!valid.rowCount) return NextResponse.json({ error: "Invalid question" }, { status: 400 });
  if (body?.action === "start") {
    const result = await query(
      `INSERT INTO ai_interview_answers (interview_id,question_id,answer_started_at,idempotency_key)
       VALUES ($1,$2,NOW(),$3) ON CONFLICT (interview_id,question_id) DO UPDATE SET answer_started_at=COALESCE(ai_interview_answers.answer_started_at,NOW()) RETURNING *`,
      [interview.id,questionId,String(body?.idempotency_key||crypto.randomUUID())]
    );
    return NextResponse.json({ answer: result.rows[0] });
  }
  if (body?.action === "complete") {
    const transcript = String(body?.transcript || "").trim().slice(0,50000);
    const duration = Math.max(0,Math.min(7200,Number(body?.duration_seconds||0)));
    const result = await query(
      `INSERT INTO ai_interview_answers (interview_id,question_id,answer_started_at,answer_completed_at,duration_seconds,transcript,transcript_status,idempotency_key)
       VALUES ($1,$2,NOW(),NOW(),$3,$4,'COMPLETED',$5)
       ON CONFLICT (interview_id,question_id) DO UPDATE SET answer_completed_at=NOW(),duration_seconds=EXCLUDED.duration_seconds,transcript=EXCLUDED.transcript,transcript_status='COMPLETED',updated_at=NOW()
       RETURNING *`,
      [interview.id,questionId,duration,transcript,String(body?.idempotency_key||crypto.randomUUID())]
    );
    await query(`UPDATE ai_interviews SET current_question_index=(SELECT order_number FROM ai_interview_questions WHERE id=$2),updated_at=NOW() WHERE id=$1`, [interview.id,questionId]);
    return NextResponse.json({ answer: result.rows[0] });
  }
  return NextResponse.json({ error: "Invalid answer action" }, { status: 400 });
}
