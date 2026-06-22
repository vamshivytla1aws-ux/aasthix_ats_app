import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { saveTrainingSubmissionAnswers } from "@/lib/training/service";
import { normalizeTrainingAnswers } from "@/lib/trainingQuestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid submission id" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const sessionId = String(body?.session_id || "").trim();
    const answers = normalizeTrainingAnswers(body?.answers);
    if (!sessionId) {
      return NextResponse.json({ error: "Missing training session" }, { status: 400 });
    }

    const submission = await saveTrainingSubmissionAnswers({ id, sessionId, answers });
    if (!submission) {
      return NextResponse.json({ error: "Training submission not found" }, { status: 404 });
    }

    await query(
      `
      INSERT INTO training_funnel_events (publisher_user_id, event_type, session_id, meta)
      VALUES ($1, 'answers_submitted', $2, jsonb_build_object('submission_id', $3, 'answer_count', $4))
      `,
      [submission.created_by_user_id, sessionId, id, submission.answer_count]
    ).catch(() => {});

    return NextResponse.json({
      ok: true,
      submission_id: submission.id,
      answer_analysis_status: submission.answer_analysis_status,
      answer_analysis_error: submission.answer_analysis_error,
      answer_analysis_mode: submission.answer_analysis_mode,
      overall_answer_score: submission.overall_answer_score,
      answer_summary: submission.answer_summary,
      answer_analyses: submission.answer_analyses,
    });
  } catch (error) {
    console.error("training answers POST", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not analyze training answers" },
      { status: 500 }
    );
  }
}
