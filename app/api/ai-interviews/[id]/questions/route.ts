import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { canAccessAiInterview } from "@/lib/aiInterviews/access";
import { generatedQuestionSchema } from "@/lib/aiInterviews/schemas";
import { generateQuestions } from "@/lib/aiInterviews/provider";
import {
  buildAdaptiveInterviewPlan,
  toStoredQuestion,
  type AdaptiveConfig,
} from "@/lib/aiInterviews/adaptive";
import { resolveAiInterviewResumeContext } from "@/lib/aiInterviews/resumeContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(id: number) {
  const auth = await requirePermission("ai_interviews.update");
  if (!auth.ok) return auth;
  if (!(await canAccessAiInterview(auth.access, id)))
    return { ok: false as const, status: 403, error: "Forbidden" };
  return auth;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const id = Number((await context.params).id);
  const auth = await authorize(id);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  const source = await query(
    `SELECT ai.*,j.title AS job_title,j.description AS job_description,j.experience_requirement,c.resume_text,c.resume_file_name,c.resume_blob
       FROM ai_interviews ai JOIN jobs j ON j.id=ai.job_id JOIN candidates c ON c.id=ai.candidate_id WHERE ai.id=$1`,
    [id],
  );
  if (!source.rowCount)
    return NextResponse.json(
      { error: "AI interview not found" },
      { status: 404 },
    );
  if (source.rows[0].status !== "DRAFT")
    return NextResponse.json(
      {
        error:
          "Questions can only be regenerated while the interview is a draft",
      },
      { status: 409 },
    );
  const row = source.rows[0];
  const resumeContext = await resolveAiInterviewResumeContext(row);
  if (
    resumeContext.source === "UPLOADED_RESUME" &&
    resumeContext.text !== String(row.resume_text || "").trim()
  ) {
    await query(
      `UPDATE candidates SET resume_text=$2,updated_at=NOW() WHERE id=$1`,
      [row.candidate_id, resumeContext.text],
    );
  }
  const adaptive =
    row.interview_mode === "ADAPTIVE"
      ? await buildAdaptiveInterviewPlan({
          title: row.job_title,
          jd: `${row.job_description || ""}\n${row.experience_requirement || ""}`,
          resume: resumeContext.text,
          skills: row.skills_json || [],
          config: row.adaptive_config_json as AdaptiveConfig,
          sourceQuality: resumeContext.sourceQuality,
          resumeSource: resumeContext.source,
        })
      : null;
  const generated = adaptive
    ? {
        questions: [toStoredQuestion(adaptive.opening)],
        generation_mode: "AI",
        mode: "AI",
        model: adaptive.model,
      }
    : await generateQuestions({
        title: row.job_title,
        description: row.job_description || "",
        experienceRequirement: row.experience_requirement || "",
        skills: row.skills_json || [],
        resumeText: resumeContext.text,
        difficulty: row.difficulty,
        count: Number(row.question_count),
        durationMinutes: Number(row.duration_minutes),
      });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM ai_interview_questions WHERE interview_id=$1`,
      [id],
    );
    for (let index = 0; index < generated.questions.length; index += 1) {
      const q: any = generated.questions[index];
      await client.query(
        `INSERT INTO ai_interview_questions (interview_id,order_number,question_text,skill_name,difficulty,expected_points_json,scoring_rubric_json,max_score,generated_by_ai,adaptive_strategy,source_type,source_reference,reason_for_asking,project_name,expected_signals_json,adaptive_depth,runtime_generated) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,FALSE)`,
        [
          id,
          index + 1,
          q.question,
          q.skill,
          q.dbDifficulty || q.difficulty,
          JSON.stringify(q.expectedPoints || q.expectedSignals || []),
          JSON.stringify(q.scoringRubric || []),
          q.maxScore || 10,
          generated.mode === "AI",
          q.strategy || null,
          q.sourceType || null,
          q.sourceReference || null,
          q.reasonForAsking || null,
          q.projectName || null,
          JSON.stringify(q.expectedSignals || []),
          q.dbDifficulty ? q.difficulty : null,
        ],
      );
    }
    await client.query(
      `UPDATE ai_interviews SET question_generation_model=$2,interview_context_json=CASE WHEN $3::jsonb='{}'::jsonb THEN interview_context_json ELSE $3::jsonb END,skill_coverage_json=CASE WHEN $4::jsonb='[]'::jsonb THEN skill_coverage_json ELSE $4::jsonb END,adaptive_state_json=CASE WHEN $5::jsonb='{}'::jsonb THEN adaptive_state_json ELSE $5::jsonb END,context_source_quality=COALESCE($6,context_source_quality),updated_at=NOW() WHERE id=$1`,
      [
        id,
        generated.model,
        JSON.stringify(adaptive?.context || {}),
        JSON.stringify(adaptive?.coverage || []),
        JSON.stringify(adaptive?.state || {}),
        adaptive?.context.sourceQuality || null,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return NextResponse.json({
    questions: generated.questions,
    generation_mode: generated.mode,
  });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const id = Number((await context.params).id);
  const auth = await authorize(id);
  if (!auth.ok)
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  const current = await query(
    `SELECT status,interview_mode,question_count FROM ai_interviews WHERE id=$1`,
    [id],
  );
  if (current.rows[0]?.status !== "DRAFT")
    return NextResponse.json(
      { error: "Questions are locked after activation" },
      { status: 409 },
    );
  const body = await request.json();
  const questions = Array.isArray(body?.questions)
    ? body.questions.map((q: unknown) => generatedQuestionSchema.parse(q))
    : [];
  if (!questions.length || questions.length > 20)
    return NextResponse.json(
      { error: "Provide between 1 and 20 questions" },
      { status: 400 },
    );
  if (current.rows[0]?.interview_mode === "ADAPTIVE" && questions.length !== 1)
    return NextResponse.json(
      { error: "Adaptive interviews allow editing only the opening question" },
      { status: 400 },
    );
  if (current.rows[0]?.interview_mode === "ADAPTIVE") {
    const q = questions[0];
    const updated = await query(
      `UPDATE ai_interview_questions
         SET question_text=$2, skill_name=$3, difficulty=$4,
             expected_points_json=$5::jsonb, expected_signals_json=$5::jsonb,
             scoring_rubric_json=$6::jsonb, max_score=$7,
             question_type=$8, starter_code=$9, coding_language=$10, test_cases_json=$11::jsonb,
             generated_by_ai=FALSE, updated_at=NOW()
       WHERE id=(SELECT id FROM ai_interview_questions WHERE interview_id=$1 ORDER BY order_number,id LIMIT 1)
       RETURNING *`,
      [
        id,
        q.question,
        q.skill,
        q.difficulty,
        JSON.stringify(q.expectedPoints),
        JSON.stringify(q.scoringRubric),
        q.maxScore,
        q.question_type || "TECHNICAL",
        q.starter_code || null,
        q.coding_language || "python",
        JSON.stringify(q.test_cases || []),
      ],
    );
    return NextResponse.json({ questions: updated.rows });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM ai_interview_questions WHERE interview_id=$1`,
      [id],
    );
    for (let index = 0; index < questions.length; index += 1) {
      const q = questions[index];
      await client.query(
        `INSERT INTO ai_interview_questions
           (interview_id, order_number, question_text, skill_name, difficulty,
            expected_points_json, scoring_rubric_json, max_score, generated_by_ai,
            question_type, starter_code, coding_language, test_cases_json)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,FALSE,$9,$10,$11,$12::jsonb)`,
        [
          id,
          index + 1,
          q.question,
          q.skill,
          q.difficulty,
          JSON.stringify(q.expectedPoints),
          JSON.stringify(q.scoringRubric),
          q.maxScore,
          q.question_type || "TECHNICAL",
          q.starter_code || null,
          q.coding_language || "python",
          JSON.stringify(q.test_cases || []),
        ],
      );
    }
    if (current.rows[0]?.interview_mode !== "ADAPTIVE")
      await client.query(
        `UPDATE ai_interviews SET question_count=$2,updated_at=NOW() WHERE id=$1`,
        [id, questions.length],
      );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return NextResponse.json({ questions });
}
