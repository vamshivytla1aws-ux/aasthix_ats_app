import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CandidateProfile = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  location: string | null;
  skills: string | null;
  current_salary: number | null;
  expected_salary: number | null;
  notice_period: string | null;
  status: "Active" | "Placed";
  resume_url: string | null;
  experience_summary: string | null;
  source: string | null;
  job_title: string | null;
  stage: string | null;
};

type TimelineItem = {
  id: number;
  type: "Applied" | "Interview" | "Selected" | "Rejected" | "Screening" | "Screening Failed";
  description: string;
  created_at: string;
};

type NoteItem = {
  id: number;
  candidate_id: number;
  note: string;
  created_at: string;
};

type ScreeningEvaluation = {
  test_id: number;
  application_id: number;
  status: string;
  stage: string | null;
  job_title: string | null;
  score: number | null;
  quality_flag: string | null;
  feedback: string | null;
  strengths: string | null;
  weaknesses: string | null;
  submitted_at: string | null;
  expires_at: string;
  answers: Array<{
    question_id: number;
    question_type: string;
    question_text: string;
    answer_text: string;
  }>;
};

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission("candidates.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const candidateId = Number(params.id);
    if (!Number.isFinite(candidateId)) {
      return NextResponse.json({ error: "Invalid candidate id" }, { status: 400 });
    }

    const candidateRes = await query(
      `
      SELECT
        c.id,
        c.full_name AS name,
        c.email,
        c.phone,
        c.linkedin_url,
        c.website_url,
        c.location,
        c.skills,
        c.notice_period,
        c.current_salary,
        c.expected_salary,
        c.resume_url,
        c.experience_summary,
        COALESCE(c.source, 'UI') AS source,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM applications ax
            WHERE ax.candidate_id = c.id
              AND ax.stage = 'Selected'
          ) THEN 'Placed'
          ELSE 'Active'
        END AS status,
        latest.stage,
        j.title AS job_title
      FROM candidates c
      LEFT JOIN LATERAL (
        SELECT a.stage, a.job_id, a.updated_at, a.id
        FROM applications a
        WHERE a.candidate_id = c.id
        ORDER BY a.updated_at DESC NULLS LAST, a.id DESC
        LIMIT 1
      ) latest ON true
      LEFT JOIN jobs j ON j.id = latest.job_id
      WHERE c.id = $1
      LIMIT 1
      `,
      [candidateId]
    );

    const candidate = candidateRes.rows?.[0] as CandidateProfile | undefined;
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const timelineRes = await query(
      `
      SELECT id, type, description, created_at
      FROM candidate_activity
      WHERE candidate_id = $1
      ORDER BY created_at DESC, id DESC
      `,
      [candidateId]
    );

    const fallbackTimelineRes =
      timelineRes.rows.length === 0
        ? await query(
            `
            SELECT
              a.id,
              a.stage AS type,
              CONCAT('Moved to ', a.stage, COALESCE(CONCAT(' for ', j.title), '')) AS description,
              a.updated_at AS created_at
            FROM applications a
            LEFT JOIN jobs j ON j.id = a.job_id
            WHERE a.candidate_id = $1
            ORDER BY a.updated_at DESC NULLS LAST, a.id DESC
            `,
            [candidateId]
          )
        : { rows: [] as any[] };

    const notesRes = await query(
      `
      SELECT id, candidate_id, note, created_at
      FROM candidate_notes
      WHERE candidate_id = $1
      ORDER BY created_at DESC, id DESC
      `,
      [candidateId]
    );

    const screeningRes = await query(
      `
      SELECT
        st.id AS test_id,
        st.application_id,
        st.status,
        a.stage,
        j.title AS job_title,
        st.score,
        st.quality_flag,
        st.feedback,
        st.strengths,
        st.weaknesses,
        st.submitted_at,
        st.expires_at
      FROM screening_tests st
      JOIN applications a ON a.id = st.application_id
      LEFT JOIN jobs j ON j.id = st.job_id
      WHERE st.candidate_id = $1
      ORDER BY COALESCE(st.submitted_at, st.created_at) DESC, st.id DESC
      LIMIT 1
      `,
      [candidateId]
    );

    let screeningEvaluation: ScreeningEvaluation | null = null;
    if (screeningRes.rowCount > 0) {
      const row = screeningRes.rows[0] as any;
      const answersRes = await query(
        `
        SELECT
          q.id AS question_id,
          q.question_type,
          q.question_text,
          COALESCE(ans.answer_text, '') AS answer_text
        FROM screening_test_questions q
        LEFT JOIN screening_test_answers ans
          ON ans.test_id = q.test_id
         AND ans.question_id = q.id
        WHERE q.test_id = $1
        ORDER BY q.sort_order ASC, q.id ASC
        `,
        [Number(row.test_id)]
      );
      screeningEvaluation = {
        test_id: Number(row.test_id),
        application_id: Number(row.application_id),
        status: String(row.status || "pending"),
        stage: row.stage ? String(row.stage) : null,
        job_title: row.job_title ? String(row.job_title) : null,
        score: row.score == null ? null : Number(row.score),
        quality_flag: row.quality_flag ? String(row.quality_flag) : null,
        feedback: row.feedback ? String(row.feedback) : null,
        strengths: row.strengths ? String(row.strengths) : null,
        weaknesses: row.weaknesses ? String(row.weaknesses) : null,
        submitted_at: row.submitted_at ? String(row.submitted_at) : null,
        expires_at: String(row.expires_at),
        answers: answersRes.rows.map((x: any) => ({
          question_id: Number(x.question_id),
          question_type: String(x.question_type || "technical"),
          question_text: String(x.question_text || ""),
          answer_text: String(x.answer_text || ""),
        })),
      };
    }

    return NextResponse.json({
      candidate,
      timeline: (timelineRes.rows.length > 0 ? timelineRes.rows : fallbackTimelineRes.rows) as TimelineItem[],
      notes: notesRes.rows as NoteItem[],
      screeningEvaluation,
    });
  } catch (error) {
    console.error("Error fetching candidate profile", error);
    return NextResponse.json({ error: "Failed to fetch candidate profile" }, { status: 500 });
  }
}

