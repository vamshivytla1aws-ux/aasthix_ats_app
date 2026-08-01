import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { canAccessAiInterview } from "@/lib/aiInterviews/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await requirePermission("ai_interviews.review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await canAccessAiInterview(auth.access, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [interview, answers, evaluation, events] = await Promise.all([
    query(`SELECT ai.*,c.full_name AS candidate_name,c.email AS candidate_email,c.phone AS candidate_phone,c.experience_summary,
                  j.title AS job_title,j.experience_requirement,u.full_name AS recruiter_name
             FROM ai_interviews ai JOIN candidates c ON c.id=ai.candidate_id JOIN jobs j ON j.id=ai.job_id
             JOIN users u ON u.id=ai.created_by_user_id WHERE ai.id=$1`, [id]),
    query(`SELECT q.order_number,q.question_text,q.skill_name,q.difficulty,q.expected_points_json,q.max_score,
                  a.transcript,a.duration_seconds,a.score,a.strengths_json,a.missing_points_json,a.evaluator_feedback
             FROM ai_interview_questions q LEFT JOIN ai_interview_answers a ON a.question_id=q.id
            WHERE q.interview_id=$1 ORDER BY q.order_number`, [id]),
    query(`SELECT * FROM ai_interview_evaluations WHERE interview_id=$1 ORDER BY created_at DESC LIMIT 1`, [id]),
    query(`SELECT event_type,severity,occurred_at,duration_seconds,evidence_timestamp_seconds,warning_number,metadata_json
             FROM ai_interview_events WHERE interview_id=$1 ORDER BY occurred_at`, [id]),
  ]);
  if (!interview.rowCount) return NextResponse.json({ error: "AI interview not found" }, { status: 404 });
  const counts = events.rows.reduce((acc: Record<string, number>, event: { event_type: string }) => {
    acc[event.event_type] = (acc[event.event_type] || 0) + 1; return acc;
  }, {});
  return NextResponse.json({ interview: interview.rows[0], answers: answers.rows, evaluation: evaluation.rows[0] || null, events: events.rows, integrity_counts: counts });
}
