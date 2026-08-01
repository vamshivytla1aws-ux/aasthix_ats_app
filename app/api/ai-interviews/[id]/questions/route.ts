import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { canAccessAiInterview } from "@/lib/aiInterviews/access";
import { generatedQuestionSchema } from "@/lib/aiInterviews/schemas";
import { generateQuestions } from "@/lib/aiInterviews/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(id: number) {
  const auth = await requirePermission("ai_interviews.update");
  if (!auth.ok) return auth;
  if (!(await canAccessAiInterview(auth.access, id))) return { ok: false as const, status: 403, error: "Forbidden" };
  return auth;
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await authorize(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const source = await query(
    `SELECT ai.*,j.title AS job_title,j.description AS job_description,j.experience_requirement,c.resume_text
       FROM ai_interviews ai JOIN jobs j ON j.id=ai.job_id JOIN candidates c ON c.id=ai.candidate_id WHERE ai.id=$1`, [id]
  );
  if (!source.rowCount) return NextResponse.json({ error: "AI interview not found" }, { status: 404 });
  if (source.rows[0].status !== "DRAFT") return NextResponse.json({ error: "Questions can only be regenerated while the interview is a draft" }, { status: 409 });
  const row = source.rows[0];
  const generated = await generateQuestions({ title: row.job_title,description: row.job_description||"",experienceRequirement: row.experience_requirement||"",skills: row.skills_json||[],resumeText: row.resume_text||"",difficulty: row.difficulty,count:Number(row.question_count),durationMinutes:Number(row.duration_minutes) });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM ai_interview_questions WHERE interview_id=$1`, [id]);
    for (let index=0; index<generated.questions.length; index+=1) {
      const q=generated.questions[index];
      await client.query(`INSERT INTO ai_interview_questions (interview_id,order_number,question_text,skill_name,difficulty,expected_points_json,scoring_rubric_json,max_score,generated_by_ai) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)`, [id,index+1,q.question,q.skill,q.difficulty,JSON.stringify(q.expectedPoints),JSON.stringify(q.scoringRubric),q.maxScore,generated.mode==="AI"]);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  return NextResponse.json({ questions: generated.questions, generation_mode: generated.mode });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await authorize(id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const current = await query(`SELECT status FROM ai_interviews WHERE id=$1`, [id]);
  if (current.rows[0]?.status !== "DRAFT") return NextResponse.json({ error: "Questions are locked after activation" }, { status: 409 });
  const body = await request.json();
  const questions = Array.isArray(body?.questions) ? body.questions.map((q: unknown) => generatedQuestionSchema.parse(q)) : [];
  if (!questions.length || questions.length > 20) return NextResponse.json({ error: "Provide between 1 and 20 questions" }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM ai_interview_questions WHERE interview_id=$1`, [id]);
    for (let index=0; index<questions.length; index+=1) {
      const q=questions[index];
      await client.query(`INSERT INTO ai_interview_questions (interview_id,order_number,question_text,skill_name,difficulty,expected_points_json,scoring_rubric_json,max_score,generated_by_ai) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,FALSE)`, [id,index+1,q.question,q.skill,q.difficulty,JSON.stringify(q.expectedPoints),JSON.stringify(q.scoringRubric),q.maxScore]);
    }
    await client.query(`UPDATE ai_interviews SET question_count=$2,updated_at=NOW() WHERE id=$1`, [id,questions.length]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  return NextResponse.json({ questions });
}
