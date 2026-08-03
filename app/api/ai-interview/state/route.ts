import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";
import { aiInterviewConfig } from "@/lib/aiInterviews/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const interview = await requireCandidateInterview();
  if (!interview)
    return NextResponse.json(
      { error: "Interview session is invalid" },
      { status: 401 },
    );
  const [questions, consent, answers] = await Promise.all([
    query(
      `SELECT id, order_number, question_text, skill_name, difficulty, question_type, starter_code, coding_language, test_cases_json FROM ai_interview_questions WHERE interview_id=$1 ORDER BY order_number`,
      [interview.id],
    ),
    query(
      `SELECT accepted_at FROM ai_interview_consents WHERE interview_id=$1`,
      [interview.id],
    ),
    query(
      `SELECT question_id,answer_started_at,answer_completed_at,transcript FROM ai_interview_answers WHERE interview_id=$1`,
      [interview.id],
    ),
  ]);
  return NextResponse.json({
    interview: {
      id: interview.id,
      title: interview.title,
      instructions: interview.instructions,
      status: interview.status,
      duration_minutes: interview.duration_minutes,
      question_count: interview.question_count,
      started_at: interview.started_at,
      expires_at: interview.expires_at,
      candidate_name: interview.candidate_name,
      job_title: interview.job_title,
      recording_enabled: interview.recording_enabled,
      screen_share_enabled: interview.screen_share_enabled,
      fullscreen_required: interview.fullscreen_required,
      camera_required: interview.camera_required,
      microphone_required: interview.microphone_required,
      face_monitoring_enabled: interview.face_monitoring_enabled,
      gaze_monitoring_enabled: interview.gaze_monitoring_enabled,
      face_missing_threshold_seconds: interview.face_missing_threshold_seconds,
      answer_audio_enabled: aiInterviewConfig.transcriptionMode !== "off",
      interview_mode: interview.interview_mode || "FIXED",
    },
    questions: questions.rows,
    consented: consent.rowCount > 0,
    answers: answers.rows,
  });
}
