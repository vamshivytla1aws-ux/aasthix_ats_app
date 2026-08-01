import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";
import {
  analyseAndGenerateNext,
  toStoredQuestion,
  updateAdaptiveState,
  type AdaptiveConfig,
  type AdaptiveContext,
  type AdaptiveQuestion,
  type AdaptiveState,
} from "@/lib/aiInterviews/adaptive";

export const runtime = "nodejs";

function storedQuestion(row: any): AdaptiveQuestion {
  return {
    strategy: row.adaptive_strategy || "TEST_MANDATORY_JD_SKILL",
    question: String(row.question_text),
    skill: String(row.skill_name || "General"),
    projectName: row.project_name || null,
    difficulty: row.adaptive_depth || "IMPLEMENTATION",
    sourceType: row.source_type || "FALLBACK",
    sourceReference:
      row.source_reference || row.skill_name || "Current requirement",
    reasonForAsking:
      row.reason_for_asking || "Evaluate role-relevant evidence.",
    expectedSignals:
      Array.isArray(row.expected_signals_json) &&
      row.expected_signals_json.length
        ? row.expected_signals_json.map(String)
        : (row.expected_points_json || []).map(String),
    maximumAnswerSeconds: 180,
  };
}

export async function POST(request: Request) {
  const interview = await requireCandidateInterview();
  if (!interview)
    return NextResponse.json(
      { error: "Interview session is invalid" },
      { status: 401 },
    );
  if (interview.status !== "IN_PROGRESS")
    return NextResponse.json(
      { error: "Interview is not in progress" },
      { status: 409 },
    );
  const body = await request.json();
  const questionId = Number(body?.question_id);
  const valid = await query(
    `SELECT * FROM ai_interview_questions WHERE id=$1 AND interview_id=$2`,
    [questionId, interview.id],
  );
  if (!valid.rowCount)
    return NextResponse.json({ error: "Invalid question" }, { status: 400 });
  const questionRow = valid.rows[0];
  if (body?.action === "start") {
    const result = await query(
      `INSERT INTO ai_interview_answers (interview_id,question_id,answer_started_at,idempotency_key)
       VALUES ($1,$2,NOW(),$3) ON CONFLICT (interview_id,question_id) DO UPDATE SET answer_started_at=COALESCE(ai_interview_answers.answer_started_at,NOW()) RETURNING *`,
      [
        interview.id,
        questionId,
        String(body?.idempotency_key || crypto.randomUUID()),
      ],
    );
    return NextResponse.json({ answer: result.rows[0] });
  }
  if (body?.action !== "complete")
    return NextResponse.json(
      { error: "Invalid answer action" },
      { status: 400 },
    );

  const transcript = String(body?.transcript || "")
    .trim()
    .slice(0, 50000);
  const duration = Math.max(
    0,
    Math.min(7200, Number(body?.duration_seconds || 0)),
  );
  const idempotencyKey = String(body?.idempotency_key || crypto.randomUUID());
  const result = await query(
    `INSERT INTO ai_interview_answers (interview_id,question_id,answer_started_at,answer_completed_at,duration_seconds,transcript,transcript_status,idempotency_key)
     VALUES ($1,$2,NOW(),NOW(),$3,$4,'COMPLETED',$5)
     ON CONFLICT (interview_id,question_id) DO UPDATE SET answer_completed_at=COALESCE(ai_interview_answers.answer_completed_at,NOW()),duration_seconds=EXCLUDED.duration_seconds,
       transcript=CASE WHEN ai_interview_answers.transcript IS NULL OR ai_interview_answers.transcript='' THEN EXCLUDED.transcript ELSE ai_interview_answers.transcript END,
       transcript_status='COMPLETED',updated_at=NOW() RETURNING *`,
    [interview.id, questionId, duration, transcript, idempotencyKey],
  );
  await query(
    `UPDATE ai_interviews SET current_question_index=$2,updated_at=NOW() WHERE id=$1`,
    [interview.id, Number(questionRow.order_number)],
  );
  if (interview.interview_mode !== "ADAPTIVE")
    return NextResponse.json({ answer: result.rows[0] });

  const existingNext = await query(
    `SELECT id,order_number,question_text,skill_name,difficulty FROM ai_interview_questions WHERE interview_id=$1 AND order_number>$2 ORDER BY order_number LIMIT 1`,
    [interview.id, questionRow.order_number],
  );
  if (existingNext.rowCount)
    return NextResponse.json({
      answer: result.rows[0],
      next_question: existingNext.rows[0],
      adaptive: true,
    });

  const state = interview.adaptive_state_json as AdaptiveState;
  const config = interview.adaptive_config_json as AdaptiveConfig;
  const context = interview.interview_context_json as AdaptiveContext;
  const elapsed = interview.started_at
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(interview.started_at).getTime()) / 1000,
        ),
      )
    : 0;
  const remainingSeconds = Math.max(
    0,
    Number(interview.duration_minutes) * 60 - elapsed,
  );
  const asked = await query(
    `SELECT question_text FROM ai_interview_questions WHERE interview_id=$1 ORDER BY order_number`,
    [interview.id],
  );
  const turn = await analyseAndGenerateNext({
    context,
    config,
    state,
    question: storedQuestion(questionRow),
    transcript: String(result.rows[0].transcript || transcript),
    remainingSeconds,
    questionsAsked: asked.rows.map((row: { question_text: unknown }) =>
      String(row.question_text),
    ),
  });
  const nextState = updateAdaptiveState(
    state,
    turn.analysis,
    String(questionRow.skill_name || "General"),
    questionRow.project_name,
    questionRow.adaptive_strategy,
  );
  const answerScore = Number(
    (Number(questionRow.max_score || 10) * (turn.analysis.score / 10)).toFixed(
      2,
    ),
  );
  await query(
    `UPDATE ai_interview_answers SET score=$2,strengths_json=$3::jsonb,missing_points_json=$4::jsonb,evaluator_feedback=$5,adaptive_analysis_json=$6::jsonb,evaluation_model=$7,updated_at=NOW() WHERE id=$1`,
    [
      result.rows[0].id,
      answerScore,
      JSON.stringify(turn.analysis.answeredExpectedSignals),
      JSON.stringify(turn.analysis.missingExpectedSignals),
      turn.analysis.answerSummary,
      JSON.stringify(turn.analysis),
      turn.mode === "AI" ? "adaptive_luna" : "rule_based",
    ],
  );

  const maximumQuestions = Math.max(
    1,
    Number(config?.maxQuestions || interview.question_count || 7),
  );
  const requiredSkills = (context.jobContext?.mandatorySkills || []).filter(
    (item) => item.priority === "CRITICAL" || item.priority === "HIGH",
  );
  const requiredCoverageReady =
    requiredSkills.length > 0 &&
    requiredSkills.every((required) =>
      nextState.skillsCovered.some(
        (item) =>
          item.skill.toLowerCase() === required.name.toLowerCase() &&
          item.coverage >= 70,
      ),
    );
  const projectCoverageReady =
    !config.projectQuestionsEnabled ||
    nextState.projectsCovered.length >=
      Math.min(
        config.minProjectQuestions,
        context.candidateContext?.projects?.length || 0,
      );
  const minimumBreadthReached =
    Number(questionRow.order_number) >= Math.min(5, maximumQuestions);
  const shouldComplete =
    Number(questionRow.order_number) >= maximumQuestions ||
    remainingSeconds <= 45 ||
    (minimumBreadthReached && requiredCoverageReady && projectCoverageReady);
  if (shouldComplete) {
    const completedState = { ...nextState, completionReady: true };
    await query(
      `UPDATE ai_interviews SET adaptive_state_json=$2::jsonb,skill_coverage_json=$3::jsonb,updated_at=NOW() WHERE id=$1`,
      [
        interview.id,
        JSON.stringify(completedState),
        JSON.stringify(completedState.skillsCovered),
      ],
    );
    return NextResponse.json({
      answer: result.rows[0],
      interview_complete: true,
      adaptive: true,
      remaining_seconds: remainingSeconds,
    });
  }

  const next = toStoredQuestion(turn.nextQuestion);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM ai_interviews WHERE id=$1 FOR UPDATE`, [
      interview.id,
    ]);
    const already = await client.query(
      `SELECT id,order_number,question_text,skill_name,difficulty FROM ai_interview_questions WHERE interview_id=$1 AND order_number=$2`,
      [interview.id, Number(questionRow.order_number) + 1],
    );
    if (already.rowCount) {
      await client.query("COMMIT");
      return NextResponse.json({
        answer: result.rows[0],
        next_question: already.rows[0],
        adaptive: true,
      });
    }
    const inserted = await client.query(
      `INSERT INTO ai_interview_questions (interview_id,order_number,question_text,skill_name,difficulty,expected_points_json,max_score,generated_by_ai,follow_up_parent_question_id,
         adaptive_strategy,source_type,source_reference,reason_for_asking,project_name,expected_signals_json,adaptive_depth,runtime_generated,triggering_answer_id)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,10,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,TRUE,$16)
       RETURNING id,order_number,question_text,skill_name,difficulty`,
      [
        interview.id,
        Number(questionRow.order_number) + 1,
        next.question,
        next.skill,
        next.dbDifficulty,
        JSON.stringify(next.expectedSignals),
        turn.mode === "AI",
        questionId,
        next.strategy,
        next.sourceType,
        next.sourceReference,
        next.reasonForAsking,
        next.projectName,
        JSON.stringify(next.expectedSignals),
        next.difficulty,
        result.rows[0].id,
      ],
    );
    await client.query(
      `UPDATE ai_interviews SET adaptive_state_json=$2::jsonb,skill_coverage_json=$3::jsonb,updated_at=NOW() WHERE id=$1`,
      [
        interview.id,
        JSON.stringify(nextState),
        JSON.stringify(nextState.skillsCovered),
      ],
    );
    await client.query("COMMIT");
    return NextResponse.json({
      answer: result.rows[0],
      next_question: inserted.rows[0],
      adaptive: true,
      remaining_seconds: remainingSeconds,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
