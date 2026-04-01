import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { evaluateScreeningAnswers, SCREENING_EVAL_MODEL } from "@/lib/screeningAi";
import { logScreeningAudit } from "@/lib/screeningAudit";
import { nextStageFromScreeningScore } from "@/lib/screeningDecision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type QaRow = {
  question_id: number;
  question_type: string;
  question_text: string;
  answer_text: string;
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const testId = Number(params.id);
  if (!Number.isFinite(testId)) return NextResponse.json({ error: "Invalid test id" }, { status: 400 });

  let body: { token?: string; answers?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = String(body?.token || "").trim();
  const answers = Array.isArray(body?.answers) ? body.answers : [];
  if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });

  let qa: QaRow[] = [];
  let applicationId = 0;
  let candidateId = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const testRes = await client.query(
      `
      SELECT st.id, st.application_id, st.candidate_id, st.job_id, st.status, st.expires_at, st.submitted_at,
             j.title AS job_title, j.description AS job_description
      FROM screening_tests st
      JOIN jobs j ON j.id = st.job_id
      WHERE st.id = $1
        AND st.access_token = $2
      FOR UPDATE
      LIMIT 1
      `,
      [testId, token]
    );
    if (testRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }

    const test = testRes.rows[0] as any;
    applicationId = Number(test.application_id);
    candidateId = Number(test.candidate_id);

    const isExpired = new Date(test.expires_at).getTime() <= Date.now();
    if (isExpired) {
      await client.query(`UPDATE screening_tests SET status = 'expired', updated_at = NOW() WHERE id = $1`, [testId]);
      await client.query("COMMIT");
      return NextResponse.json({ error: "Test link expired. Contact recruiter for resend." }, { status: 410 });
    }
    if (test.status !== "pending" || test.submitted_at) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Test already submitted." }, { status: 409 });
    }

    const questionsRes = await client.query(
      `
      SELECT id, question_type, question_text
      FROM screening_test_questions
      WHERE test_id = $1
      ORDER BY sort_order ASC, id ASC
      `,
      [testId]
    );
    if (questionsRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "No questions found for this test." }, { status: 400 });
    }

    const answerMap = new Map<number, string>();
    for (const row of answers) {
      const questionId = Number((row as any)?.question_id);
      if (!Number.isFinite(questionId)) continue;
      answerMap.set(questionId, String((row as any)?.answer_text || "").trim());
    }

    qa = questionsRes.rows.map((q: any) => {
      const id = Number(q.id);
      return {
        question_id: id,
        question_type: String(q.question_type || "technical"),
        question_text: String(q.question_text || ""),
        answer_text: answerMap.get(id) || "",
      };
    });

    if (qa.some((x) => x.answer_text.length === 0)) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Please answer all questions before submitting." }, { status: 400 });
    }

    await client.query(`DELETE FROM screening_test_answers WHERE test_id = $1`, [testId]);
    for (const item of qa) {
      await client.query(
        `
        INSERT INTO screening_test_answers (test_id, question_id, answer_text, created_at)
        VALUES ($1, $2, $3, NOW())
        `,
        [testId, item.question_id, item.answer_text]
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("Error submitting screening test (tx1)", e);
    client.release();
    return NextResponse.json({ error: "Failed to submit screening test" }, { status: 500 });
  }
  client.release();

  const jobRow = await pool.query(
    `SELECT j.title AS job_title, j.description AS job_description FROM screening_tests st JOIN jobs j ON j.id = st.job_id WHERE st.id = $1`,
    [testId]
  );
  const finalEval = await evaluateScreeningAnswers({
    jobTitle: String(jobRow.rows[0]?.job_title || ""),
    jobDescription: String(jobRow.rows[0]?.job_description || ""),
    skillsCsv: "",
    questions: qa.map((x) => ({
      question_type: x.question_type,
      question_text: x.question_text,
      answer_text: x.answer_text,
    })),
  });
  const nextStage = nextStageFromScreeningScore(finalEval.score);

  const client2 = await pool.connect();
  try {
    await client2.query("BEGIN");
    const lock = await client2.query(
      `
      SELECT st.id, st.application_id, st.candidate_id, st.status
      FROM screening_tests st
      WHERE st.id = $1 AND st.access_token = $2
      FOR UPDATE
      `,
      [testId, token]
    );
    if (lock.rowCount === 0) {
      await client2.query("ROLLBACK");
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }
    const st = lock.rows[0] as any;
    if (st.status !== "pending") {
      await client2.query("ROLLBACK");
      return NextResponse.json({ error: "Test already submitted." }, { status: 409 });
    }

    const upd = await client2.query(
      `
      UPDATE screening_tests
      SET status = 'submitted',
          submitted_at = NOW(),
          score = $2,
          feedback = $3,
          strengths = $4,
          weaknesses = $5,
          quality_flag = $6,
          ai_raw = $7::jsonb,
          evaluation_model = $8,
          updated_at = NOW()
      WHERE id = $1 AND status = 'pending'
      RETURNING id
      `,
      [
        testId,
        finalEval.score,
        finalEval.feedback,
        finalEval.strengths,
        finalEval.weaknesses,
        finalEval.quality_flag,
        JSON.stringify(finalEval.ai_raw || {}),
        SCREENING_EVAL_MODEL,
      ]
    );
    if (upd.rowCount === 0) {
      await client2.query("ROLLBACK");
      return NextResponse.json({ error: "Test already submitted." }, { status: 409 });
    }

    await client2.query(`UPDATE applications SET stage = $2, status = $2, updated_at = NOW() WHERE id = $1`, [
      Number(st.application_id),
      nextStage,
    ]);

    try {
      await client2.query(`DELETE FROM screening_test_drafts WHERE test_id = $1`, [testId]);
    } catch {
      // optional table
    }

    await client2.query("COMMIT");
    applicationId = Number(st.application_id);
    candidateId = Number(st.candidate_id);
  } catch (e) {
    try {
      await client2.query("ROLLBACK");
    } catch {
      // ignore
    }
    console.error("Error finalizing screening submit", e);
    client2.release();
    return NextResponse.json({ error: "Failed to finalize submission" }, { status: 500 });
  }
  client2.release();

  try {
    const msg =
      finalEval.score >= 70
        ? `Screening completed (score ${finalEval.score}/100)`
        : `Screening below threshold (score ${finalEval.score}/100)`;
    await pool.query(
      `INSERT INTO candidate_activity (candidate_id, type, description, created_at) VALUES ($1, 'Screening', $2, NOW())`,
      [candidateId, msg]
    );
  } catch {
    // optional
  }

  await logScreeningAudit({
    event_type: "submitted",
    application_id: applicationId,
    test_id: testId,
    candidate_id: candidateId,
    created_by_user_id: null,
    metadata: { score: finalEval.score, next_stage: nextStage, quality_flag: finalEval.quality_flag },
  });

  return NextResponse.json({
    ok: true,
    stage: nextStage,
    evaluation: {
      score: finalEval.score,
      feedback: finalEval.feedback,
      strengths: finalEval.strengths,
      weaknesses: finalEval.weaknesses,
      quality_flag: finalEval.quality_flag,
    },
  });
}
