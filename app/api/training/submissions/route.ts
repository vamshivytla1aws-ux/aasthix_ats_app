import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { summarizeTrainingSubmission } from "@/lib/training/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("jobs.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const result = await query(
      `
      SELECT
        id,
        created_by_user_id,
        full_name,
        email,
        phone,
        source,
        consent_accepted,
        resume_url,
        resume_text,
        resume_file_name,
        review_status,
        resume_parse_status,
        resume_parse_error,
        question_generation_status,
        question_generation_error,
        answer_analysis_status,
        answer_analysis_error,
        generated_mode,
        answer_analysis_mode,
        generated_questions,
        trainee_answers,
        answer_analyses,
        overall_answer_score,
        answer_summary,
        reviewer_notes,
        session_id,
        submitted_at,
        created_at,
        updated_at,
        answers_submitted_at
      FROM training_submissions
      ORDER BY submitted_at DESC, id DESC
      `
    );

    return NextResponse.json({
      submissions: result.rows.map((row: unknown) => summarizeTrainingSubmission(row as never)),
    });
  } catch (error) {
    console.error("training submissions GET", error);
    return NextResponse.json({ error: "Failed to load training submissions" }, { status: 500 });
  }
}

