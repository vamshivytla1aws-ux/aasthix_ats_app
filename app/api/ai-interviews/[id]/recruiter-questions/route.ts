import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { canAccessAiInterview } from "@/lib/aiInterviews/access";
import { generatedQuestionSchema } from "@/lib/aiInterviews/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(id: number) {
  const auth = await requirePermission("ai_interviews.update");
  if (!auth.ok) return auth;
  if (!(await canAccessAiInterview(auth.access, id))) return { ok: false as const, status: 403, error: "Forbidden" };
  return auth;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await authorize(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const rows = await query(`SELECT * FROM ai_interview_recruiter_questions WHERE interview_id=$1 ORDER BY sort_order,id`, [id]);
  return NextResponse.json({ questions: rows.rows });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await authorize(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const current = await query(`SELECT status,interview_mode FROM ai_interviews WHERE id=$1`, [id]);
  if (!current.rowCount) return NextResponse.json({ error: "AI interview not found" }, { status: 404 });
  if (current.rows[0].status !== "DRAFT") return NextResponse.json({ error: "Questions are locked after activation" }, { status: 409 });
  const body = await request.json();
  const questions = Array.isArray(body?.questions)
    ? body.questions.filter((item: unknown) => item && typeof item === "object" && String((item as { question?: unknown }).question || "").trim()).map((item: unknown) => generatedQuestionSchema.parse(item))
    : [];
  if (questions.length > 20) return NextResponse.json({ error: "Provide no more than 20 recruiter questions" }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM ai_interview_recruiter_questions WHERE interview_id=$1`, [id]);
    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      await client.query(`INSERT INTO ai_interview_recruiter_questions (interview_id,sort_order,question_text,skill_name,difficulty,expected_points_json,scoring_rubric_json,max_score,required,created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,TRUE,$9)`, [id, index + 1, question.question, question.skill, question.difficulty, JSON.stringify(question.expectedPoints), JSON.stringify(question.scoringRubric), question.maxScore, auth.access.user_id]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return NextResponse.json({ ok: true, count: questions.length });
}
