import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { fetchSimilarJobsByEmbedding } from "@/lib/matchJobs/similarJobsByEmbedding";

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
  location_source?: "parsed" | "manual" | null;
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
  /** Same semantics as GET /api/applications — latest application’s interview loop */
  current_interview_round_order: number | null;
  current_interview_round_label: string | null;
  interview_round_total: number;
  interview_round_status: string | null;
  interview_substatus: string | null;
  interview_completed_at: string | null;
  interview_status_note: string | null;
  meet_link: string | null;
  calendar_sync_status: string | null;
  calendar_sync_error: string | null;
  calendar_organizer_email: string | null;
  /** Latest application by updated_at — compare with pipeline row for same candidate */
  latest_application_id: number | null;
  onboarding_status?: string | null;
};

type TimelineItem = {
  id: number;
  type:
    | "Applied"
    | "Interview"
    | "Selected"
    | "Rejected"
    | "Screening"
    | "Screening Failed"
    | "stage_move"
    | "interview_schedule"
    | "interview_reschedule"
    | "invite_sent"
    | "interview_outcome"
    | "record_updated"
    | "onboarding_link_sent"
    | "onboarding_started"
    | "onboarding_submitted"
    | "onboarding_exported";
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

type InterviewRubricFeedbackItem = {
  question_id: number;
  question: string;
  category: string;
  asked: boolean;
  notes: string | null;
  /** 1–5 structured scorecard rating when recorded */
  rating: number | null;
};

type DispositionFeedbackItem = {
  id: number;
  label: string;
  notes: string | null;
  created_at: string;
  job_title: string | null;
};

type SimilarJobMatch = {
  job_id: number;
  title: string;
  company: string | null;
  location: string | null;
  match_score: number;
  already_applied: boolean;
  application_stage: string | null;
  match_source?: "table" | "embedding";
};

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission("candidates.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const candidateId = Number(params.id);
    if (!Number.isFinite(candidateId)) {
      return NextResponse.json({ error: "Invalid candidate id" }, { status: 400 });
    }

    const url = new URL(request.url);
    const applicationRaw =
      url.searchParams.get("application") ?? url.searchParams.get("app") ?? url.searchParams.get("application_id");
    const jobIdRaw = url.searchParams.get("job_id");
    const applicationId = applicationRaw != null && applicationRaw !== "" ? Number(applicationRaw) : NaN;
    const jobIdFilter = jobIdRaw != null && jobIdRaw !== "" ? Number(jobIdRaw) : NaN;

    let lateralFromWhere: string;
    const sqlParams: unknown[] = [candidateId];

    if (Number.isFinite(applicationId) && applicationId > 0) {
      sqlParams.push(applicationId);
      lateralFromWhere = `
        FROM applications a
        WHERE a.candidate_id = c.id AND a.id = $2
        LIMIT 1`;
    } else if (Number.isFinite(jobIdFilter) && jobIdFilter > 0) {
      sqlParams.push(jobIdFilter);
      lateralFromWhere = `
        FROM applications a
        WHERE a.candidate_id = c.id AND a.job_id = $2
        ORDER BY a.updated_at DESC NULLS LAST, a.id DESC
        LIMIT 1`;
    } else {
      lateralFromWhere = `
        FROM applications a
        WHERE a.candidate_id = c.id
        ORDER BY a.updated_at DESC NULLS LAST, a.id DESC
        LIMIT 1`;
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
        c.location_source,
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
        latest.id AS latest_application_id,
        j.title AS job_title,
        latest.current_interview_round_order,
        jir.round_label AS current_interview_round_label,
        COALESCE(jrc.round_count, 0) AS interview_round_total,
        latest.interview_round_status,
        latest.interview_substatus,
        latest.interview_completed_at,
        latest.interview_status_note,
        latest.meet_link,
        latest.calendar_sync_status,
        latest.calendar_sync_error,
        latest.calendar_organizer_email
      FROM candidates c
      LEFT JOIN LATERAL (
        SELECT
          a.stage,
          a.job_id,
          a.updated_at,
          a.id,
          a.current_interview_round_id,
          a.current_interview_round_order,
          a.interview_round_status,
          a.interview_substatus,
          a.interview_completed_at,
          a.interview_status_note,
          a.meet_link,
          a.calendar_sync_status,
          a.calendar_sync_error,
          a.calendar_organizer_email
        ${lateralFromWhere}
      ) latest ON true
      LEFT JOIN jobs j ON j.id = latest.job_id
      LEFT JOIN job_interview_rounds jir ON jir.id = latest.current_interview_round_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS round_count
        FROM job_interview_rounds jr
        WHERE jr.job_id = latest.job_id
      ) jrc ON true
      WHERE c.id = $1
      LIMIT 1
      `,
      sqlParams
    );

    const candidate = candidateRes.rows?.[0] as CandidateProfile | undefined;
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    candidate.interview_round_total = Number(candidate.interview_round_total ?? 0);
    if (candidate.current_interview_round_order != null) {
      candidate.current_interview_round_order = Number(candidate.current_interview_round_order);
    }
    if (candidate.latest_application_id != null) {
      candidate.latest_application_id = Number(candidate.latest_application_id);
    }
    if (candidate.stage !== "Interview") {
      candidate.current_interview_round_order = null;
      candidate.current_interview_round_label = null;
      candidate.interview_round_total = 0;
      candidate.interview_round_status = null;
      candidate.interview_substatus = null;
      candidate.interview_completed_at = null;
      candidate.interview_status_note = null;
      candidate.meet_link = null;
      candidate.calendar_sync_status = null;
      candidate.calendar_sync_error = null;
      candidate.calendar_organizer_email = null;
    }

    let onboardingPackets: Array<{
      id: number;
      application_id: number;
      status: string;
      created_at: string;
      submitted_at: string | null;
      exported_at: string | null;
      job_title: string | null;
    }> = [];
    try {
      const onboardingRes = await query(
        `
        SELECT
          p.id,
          p.application_id,
          p.status,
          p.created_at,
          p.submitted_at,
          p.exported_at,
          j.title AS job_title
        FROM application_onboarding_packets p
        JOIN applications a ON a.id = p.application_id
        LEFT JOIN jobs j ON j.id = a.job_id
        WHERE p.candidate_id = $1
        ORDER BY p.created_at DESC, p.id DESC
        `,
        [candidateId]
      );
      onboardingPackets = onboardingRes.rows.map((row: any) => ({
        id: Number(row.id),
        application_id: Number(row.application_id),
        status: String(row.status || "not_sent"),
        created_at: String(row.created_at),
        submitted_at: row.submitted_at ? String(row.submitted_at) : null,
        exported_at: row.exported_at ? String(row.exported_at) : null,
        job_title: row.job_title ? String(row.job_title) : null,
      }));
      candidate.onboarding_status = onboardingPackets[0]?.status ?? null;
    } catch {
      onboardingPackets = [];
      candidate.onboarding_status = null;
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

    const screeningAppId = candidate.latest_application_id;
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
        AND ($2::bigint IS NULL OR st.application_id = $2)
      ORDER BY COALESCE(st.submitted_at, st.created_at) DESC, st.id DESC
      LIMIT 1
      `,
      [candidateId, screeningAppId ?? null]
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

    let interviewRubricFeedback: InterviewRubricFeedbackItem[] = [];
    if (candidate.latest_application_id) {
      try {
        const rubricRes = await query(
          `
          SELECT
            f.question_id,
            q.question,
            q.category,
            f.asked,
            f.notes,
            f.rating
          FROM application_interview_question_feedback f
          JOIN job_interview_questions q ON q.id = f.question_id
          WHERE f.application_id = $1
          ORDER BY q.sort_order ASC, q.id ASC
          `,
          [candidate.latest_application_id]
        );
        interviewRubricFeedback = rubricRes.rows.map((row: any) => ({
          question_id: Number(row.question_id),
          question: String(row.question || ""),
          category: String(row.category || ""),
          asked: Boolean(row.asked),
          notes: row.notes == null || String(row.notes).trim() === "" ? null : String(row.notes),
          rating:
            row.rating == null || row.rating === ""
              ? null
              : Math.min(5, Math.max(1, Number(row.rating))),
        }));
      } catch {
        interviewRubricFeedback = [];
      }
    }

    let dispositionFeedback: DispositionFeedbackItem[] = [];
    try {
      const dispRes = await query(
        `
        SELECT
          de.id,
          dr.label,
          de.notes,
          de.created_at,
          j.title AS job_title
        FROM disposition_events de
        JOIN disposition_reasons dr ON dr.id = de.disposition_reason_id
        JOIN applications a ON a.id = de.entity_id
        LEFT JOIN jobs j ON j.id = a.job_id
        WHERE de.entity_type = 'application'
          AND a.candidate_id = $1
        ORDER BY de.created_at DESC, de.id DESC
        LIMIT 25
        `,
        [candidateId]
      );
      dispositionFeedback = dispRes.rows.map((row: any) => ({
        id: Number(row.id),
        label: String(row.label || ""),
        notes: row.notes == null || String(row.notes).trim() === "" ? null : String(row.notes),
        created_at: String(row.created_at),
        job_title: row.job_title ? String(row.job_title) : null,
      }));
    } catch {
      dispositionFeedback = [];
    }

    let similarJobMatches: SimilarJobMatch[] = [];
    try {
      const simRes = await query(
        `
        SELECT
          m.job_id,
          j.title,
          j.company,
          j.location,
          COALESCE(m.ai_rerank_score, m.match_score)::int AS match_score,
          m.already_applied,
          m.application_stage
        FROM candidate_job_matches m
        JOIN jobs j ON j.id = m.job_id
        WHERE m.candidate_id = $1
        ORDER BY COALESCE(m.ai_rerank_score, m.match_score) DESC NULLS LAST, m.id DESC
        LIMIT 12
        `,
        [candidateId]
      );
      similarJobMatches = simRes.rows.map((row: any) => ({
        job_id: Number(row.job_id),
        title: String(row.title || ""),
        company: row.company != null ? String(row.company) : null,
        location: row.location != null ? String(row.location) : null,
        match_score: Number(row.match_score ?? 0),
        already_applied: Boolean(row.already_applied),
        application_stage: row.application_stage != null ? String(row.application_stage) : null,
        match_source: "table" as const,
      }));
    } catch {
      similarJobMatches = [];
    }

    if (similarJobMatches.length < 6) {
      try {
        const emb = await fetchSimilarJobsByEmbedding(candidateId, 16);
        const seen = new Set(similarJobMatches.map((m) => m.job_id));
        for (const e of emb) {
          if (seen.has(e.job_id)) continue;
          seen.add(e.job_id);
          similarJobMatches.push({
            job_id: e.job_id,
            title: e.title,
            company: e.company,
            location: e.location,
            match_score: e.match_score,
            already_applied: false,
            application_stage: null,
            match_source: "embedding",
          });
          if (similarJobMatches.length >= 12) break;
        }
      } catch {
        /* optional */
      }
    }

    return NextResponse.json({
      candidate,
      timeline: (timelineRes.rows.length > 0 ? timelineRes.rows : fallbackTimelineRes.rows) as TimelineItem[],
      notes: notesRes.rows as NoteItem[],
      onboarding_packets: onboardingPackets,
      screeningEvaluation,
      interviewRubricFeedback,
      dispositionFeedback,
      similarJobMatches,
    });
  } catch (error) {
    console.error("Error fetching candidate profile", error);
    return NextResponse.json({ error: "Failed to fetch candidate profile" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requirePermission("candidates.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const candidateId = Number(params.id);
    if (!Number.isFinite(candidateId)) {
      return NextResponse.json({ error: "Invalid candidate id" }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const rawLocation = typeof body?.location === "string" ? body.location.trim() : "";
    const location = rawLocation.length > 0 ? rawLocation.slice(0, 120) : null;
    const locationSource = location ? "manual" : "parsed";

    const result = await query(
      `
      UPDATE candidates
      SET
        location = $2,
        location_source = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, location, location_source
      `,
      [candidateId, location, locationSource]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating candidate location", error);
    return NextResponse.json({ error: "Failed to update candidate location" }, { status: 500 });
  }
}
