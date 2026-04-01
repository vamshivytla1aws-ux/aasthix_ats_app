import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const testId = Number(params.id);
    if (!Number.isFinite(testId)) {
      return NextResponse.json({ error: "Invalid test id" }, { status: 400 });
    }

    const url = new URL(request.url);
    const token = String(url.searchParams.get("token") || "").trim();
    const deviceId = String(url.searchParams.get("device_id") || "").trim();
    if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });

    const testRes = await query(
      `
      SELECT
        st.id,
        st.application_id,
        st.status,
        st.expires_at,
        st.submitted_at,
        st.score,
        st.feedback,
        st.strengths,
        st.weaknesses,
        st.quality_flag,
        c.full_name AS candidate_name,
        j.title AS job_title
      FROM screening_tests st
      JOIN candidates c ON c.id = st.candidate_id
      JOIN jobs j ON j.id = st.job_id
      WHERE st.id = $1
        AND st.access_token = $2
      LIMIT 1
      `,
      [testId, token]
    );
    if (testRes.rowCount === 0) return NextResponse.json({ error: "Test not found" }, { status: 404 });

    const test = testRes.rows[0] as any;
    const expired = new Date(test.expires_at).getTime() <= Date.now();
    if (expired && test.status === "pending") {
      await query(`UPDATE screening_tests SET status = 'expired', updated_at = NOW() WHERE id = $1`, [testId]);
      test.status = "expired";
    }

    const questionsRes = await query(
      `
      SELECT id, question_type, question_text, sort_order
      FROM screening_test_questions
      WHERE test_id = $1
      ORDER BY sort_order ASC, id ASC
      `,
      [testId]
    );

    const answersRes = await query(
      `
      SELECT question_id, answer_text
      FROM screening_test_answers
      WHERE test_id = $1
      `,
      [testId]
    );
    const answerMap = new Map<number, string>(
      answersRes.rows.map((r: any) => [Number(r.question_id), String(r.answer_text || "")])
    );

    let draftMap = new Map<number, string>();
    if (deviceId && test.status === "pending") {
      try {
        const draftRes = await query(
          `SELECT answers_json FROM screening_test_drafts WHERE test_id = $1 AND device_id = $2 LIMIT 1`,
          [testId, deviceId]
        );
        const raw = draftRes.rows?.[0]?.answers_json as Record<string, string> | undefined;
        if (raw && typeof raw === "object") {
          for (const [k, v] of Object.entries(raw)) {
            const id = Number(k);
            if (Number.isFinite(id)) draftMap.set(id, String(v ?? ""));
          }
        }
      } catch {
        draftMap = new Map();
      }
    }

    const questions = questionsRes.rows.map((q: any) => {
      const qid = Number(q.id);
      const saved = answerMap.get(qid) || "";
      const draft = draftMap.get(qid) || "";
      return {
        id: qid,
        question_type: String(q.question_type),
        question_text: String(q.question_text),
        sort_order: Number(q.sort_order || 0),
        answer_text: saved || draft,
      };
    });

    return NextResponse.json({
      test: {
        id: Number(test.id),
        application_id: Number(test.application_id),
        status: String(test.status),
        expires_at: String(test.expires_at),
        submitted_at: test.submitted_at ? String(test.submitted_at) : null,
        score: test.score == null ? null : Number(test.score),
        feedback: test.feedback || null,
        strengths: test.strengths || null,
        weaknesses: test.weaknesses || null,
        quality_flag: test.quality_flag || null,
        candidate_name: String(test.candidate_name || "Candidate"),
        job_title: String(test.job_title || "Role"),
      },
      questions,
    });
  } catch (error) {
    console.error("Error loading screening test", error);
    return NextResponse.json({ error: "Failed to load screening test" }, { status: 500 });
  }
}
