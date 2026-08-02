import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { applicationAccessPredicate, hasJobTeamTable } from "@/lib/applicationVisibility";
import { fetchApplicationCardRow, fetchApplicationsRows } from "@/lib/applicationCard";
import { createAndSendScreeningTest } from "@/lib/screeningWorkflow";
import { logScreeningAudit } from "@/lib/screeningAudit";
import { recordDispositionEvent, validateDispositionReason } from "@/lib/dispositionAudit";
import { sendEmailMessage } from "@/lib/sendEmail";
import { buildCandidateEmailTemplate } from "@/lib/candidateEmailTemplate";
import { syncInterviewMeeting } from "@/lib/services/googleCalendar";
import { ATS_TIMEZONE_LABEL, formatInAtsTimezone } from "@/lib/timezones";

export const runtime = "nodejs";

const STAGES = ["Applied", "Screening", "Screening Failed", "Interview", "Selected", "Rejected"] as const;
type Stage = (typeof STAGES)[number];
const INTERVIEW_SUBSTATUSES = ["scheduled", "completed_followup", "no_show", "cancelled"] as const;
type InterviewSubstatus = (typeof INTERVIEW_SUBSTATUSES)[number];

function normalizeInterviewAttendeeEmails(value: unknown) {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,;]/g)
      : [];
  return Array.from(
    new Set(
      rawValues
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
        .filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
    )
  ).slice(0, 25);
}

function normalizeMeetingSyncStatus(status: string | null | undefined) {
  const value = String(status || "").trim().toLowerCase();
  if (!value) return null;
  if (
    value === "meet_created" ||
    value === "invite_sent" ||
    value === "calendar_sync_failed" ||
    value === "google_not_connected" ||
    value === "calendar_event_cancelled"
  ) {
    return value;
  }
  return null;
}

function isStage(value: unknown): value is Stage {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value);
}

function isInterviewSubstatus(value: unknown): value is InterviewSubstatus {
  return typeof value === "string" && (INTERVIEW_SUBSTATUSES as readonly string[]).includes(value);
}

function formatEmailDateTime(value: string | null | undefined) {
  if (!value) return "";
  try {
    return `${formatInAtsTimezone(value)} (${ATS_TIMEZONE_LABEL})`;
  } catch {
    return String(value);
  }
}

async function safeFetchApplicationCardRow(applicationId: number, userId: number) {
  try {
    return await fetchApplicationCardRow(applicationId, userId);
  } catch (error) {
    console.error("Failed to load application card row", { applicationId, userId, error });
    return null;
  }
}

async function appendCandidateTrackingEvent(input: {
  userId: number;
  candidateId: number;
  applicationId: number;
  type: string;
  message: string;
}) {
  const { userId, candidateId, applicationId, type, message } = input;
  const normalizedTypeMap: Record<string, string> = {
    Applied: "stage_move",
    Screening: "stage_move",
    "Screening Failed": "stage_move",
    Interview: "interview_outcome",
    Selected: "stage_move",
    Rejected: "stage_move",
    stage_move: "stage_move",
    interview_schedule: "interview_schedule",
    interview_reschedule: "interview_reschedule",
    invite_sent: "invite_sent",
    interview_outcome: "interview_outcome",
    record_updated: "record_updated",
  };
  const rawType = String(type || "record_updated").trim();
  const safeType = (normalizedTypeMap[rawType] || "record_updated").slice(0, 64);
  const safeMessage = String(message || "").trim().slice(0, 2000);
  if (!safeMessage) return;
  try {
    await query(
      `
      INSERT INTO candidate_activity (candidate_id, type, description, created_at)
      VALUES ($1, $2, $3, NOW())
      `,
      [candidateId, safeType, safeMessage]
    );
  } catch {
    // optional legacy table
  }
  try {
    await query(
      `
      INSERT INTO activity_timeline (user_id, candidate_id, application_id, event_type, message, metadata)
      VALUES ($1, $2, $3, $4, $5, '{}'::jsonb)
      `,
      [userId, candidateId, applicationId, safeType, safeMessage]
    );
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) throw error;
  }
}

function isSchemaCompatibilityError(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === "42703" || code === "42P01";
}

async function loadPreviousApplicationState(
  applicationId: number,
  userId: number,
  accessWhere2: string
) {
  try {
    const prev = await query(
      `
      SELECT
        a.stage,
        a.interview_scheduled,
        a.interview_datetime,
        a.interview_substatus AS prev_interview_substatus,
        a.interview_completed_at AS prev_interview_completed_at,
        a.interview_status_note AS prev_interview_status_note,
        a.interview_attendee_emails AS prev_interview_attendee_emails,
        a.external_calendar_event_id AS prev_external_calendar_event_id,
        a.meet_link AS prev_meet_link,
        a.calendar_sync_status AS prev_calendar_sync_status,
        a.calendar_sync_error AS prev_calendar_sync_error,
        a.calendar_organizer_email AS prev_calendar_organizer_email,
        a.job_id AS prev_job_id,
        a.current_interview_round_id AS prev_round_id,
        a.current_interview_round_order AS prev_round_order,
        jir.round_label AS prev_round_label,
        a.interview_round_status AS prev_round_status
      FROM applications a
      LEFT JOIN job_interview_rounds jir ON jir.id = a.current_interview_round_id
      WHERE a.id = $1 AND (${accessWhere2})
      `,
      [applicationId, userId]
    );
    return prev;
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) throw error;
    return await query(
      `
      SELECT
        COALESCE(a.stage, a.status, 'Applied') AS stage,
        COALESCE(a.interview_scheduled, FALSE) AS interview_scheduled,
        a.interview_datetime,
        NULL::text AS prev_interview_substatus,
        NULL::timestamptz AS prev_interview_completed_at,
        NULL::text AS prev_interview_status_note,
        '[]'::jsonb AS prev_interview_attendee_emails,
        NULL::text AS prev_external_calendar_event_id,
        NULL::text AS prev_meet_link,
        NULL::text AS prev_calendar_sync_status,
        NULL::text AS prev_calendar_sync_error,
        NULL::text AS prev_calendar_organizer_email,
        a.job_id AS prev_job_id,
        NULL::bigint AS prev_round_id,
        NULL::int AS prev_round_order,
        NULL::text AS prev_round_label,
        NULL::text AS prev_round_status
      FROM applications a
      WHERE a.id = $1 AND (${accessWhere2})
      `,
      [applicationId, userId]
    );
  }
}

async function updateApplicationStageCore(input: {
  id: number;
  stage: Stage | undefined;
  interview_scheduled: boolean | undefined;
  interview_datetime: string | undefined;
  interview_reschedule_reason: string | null | undefined;
  interview_cancel_reason: string | null | undefined;
  interview_no_show: boolean | undefined;
  reminder_sent: boolean | undefined;
  interview_substatus: InterviewSubstatus | null | undefined;
  interview_completed_at: string | null | undefined;
  interview_status_note: string | null | undefined;
  interview_attendee_emails: string[] | undefined;
  userId: number;
  accessWhere13: string;
  accessWhere5: string;
}) {
  const {
    id,
    stage,
    interview_scheduled,
    interview_datetime,
    interview_reschedule_reason,
    interview_cancel_reason,
    interview_no_show,
    reminder_sent,
    interview_substatus,
    interview_completed_at,
    interview_status_note,
    interview_attendee_emails,
    userId,
    accessWhere13,
    accessWhere5,
  } = input;

  try {
    return await query(
      `
      UPDATE applications
      SET stage = COALESCE($2::text, applications.stage),
          status = COALESCE($2::text, applications.status),
          interview_scheduled = CASE WHEN $3::boolean IS NULL THEN interview_scheduled ELSE $3::boolean END,
          interview_datetime = CASE WHEN $4::timestamptz IS NULL THEN interview_datetime ELSE $4::timestamptz END,
          interview_reschedule_reason = CASE WHEN $5::text IS NULL THEN interview_reschedule_reason ELSE $5::text END,
          interview_cancel_reason = CASE WHEN $6::text IS NULL THEN interview_cancel_reason ELSE $6::text END,
          interview_no_show = CASE WHEN $7::boolean IS NULL THEN interview_no_show ELSE $7::boolean END,
          reminder_sent = CASE WHEN $8::boolean IS NULL THEN reminder_sent ELSE $8::boolean END,
          interview_substatus = CASE
            WHEN COALESCE($2::text, applications.stage) <> 'Interview' THEN NULL
            ELSE $9::text
          END,
          interview_completed_at = CASE
            WHEN COALESCE($2::text, applications.stage) <> 'Interview' THEN NULL
            ELSE $10::timestamptz
          END,
          interview_status_note = CASE
            WHEN COALESCE($2::text, applications.stage) <> 'Interview' THEN NULL
            ELSE $11::text
          END,
          interview_attendee_emails = CASE
            WHEN COALESCE($2::text, applications.stage) <> 'Interview' THEN '[]'::jsonb
            WHEN $12::jsonb IS NULL THEN applications.interview_attendee_emails
            ELSE $12::jsonb
          END,
          current_interview_round_id = CASE
            WHEN COALESCE($2::text, applications.stage) <> 'Interview' THEN NULL
            ELSE applications.current_interview_round_id
          END,
          current_interview_round_order = CASE
            WHEN COALESCE($2::text, applications.stage) <> 'Interview' THEN NULL
            ELSE applications.current_interview_round_order
          END,
          interview_round_status = CASE
            WHEN COALESCE($2::text, applications.stage) <> 'Interview' THEN 'not_started'
            ELSE applications.interview_round_status
          END,
          rejected_in_round_order = CASE
            WHEN COALESCE($2::text, applications.stage) = 'Rejected' THEN COALESCE(applications.current_interview_round_order, applications.rejected_in_round_order)
            ELSE applications.rejected_in_round_order
          END,
          selected_after_rounds = CASE
            WHEN COALESCE($2::text, applications.stage) = 'Selected' THEN COALESCE(applications.current_interview_round_order, applications.selected_after_rounds)
            ELSE applications.selected_after_rounds
          END,
          final_outcome = CASE
            WHEN COALESCE($2::text, applications.stage) = 'Selected' THEN 'selected'
            WHEN COALESCE($2::text, applications.stage) = 'Rejected' THEN 'rejected'
            ELSE applications.final_outcome
          END,
          updated_at = NOW()
      WHERE id = $1 AND (${accessWhere13})
      RETURNING id, candidate_id, job_id, stage, updated_at, interview_scheduled, interview_datetime, interview_reschedule_reason, interview_cancel_reason, interview_no_show, reminder_sent, interview_substatus, interview_completed_at, interview_status_note, interview_attendee_emails, calendar_provider, external_calendar_event_id, meet_link, calendar_organizer_email, calendar_last_synced_at, calendar_sync_status, calendar_sync_error, current_interview_round_id, current_interview_round_order, interview_round_status, rejected_in_round_order, selected_after_rounds, final_outcome
      `,
      [
        id,
        stage ?? null,
        typeof interview_scheduled === "boolean" ? interview_scheduled : null,
        typeof interview_datetime === "string" ? interview_datetime : null,
        typeof interview_reschedule_reason === "string" ? interview_reschedule_reason : null,
        typeof interview_cancel_reason === "string" ? interview_cancel_reason : null,
        typeof interview_no_show === "boolean" ? interview_no_show : null,
        typeof reminder_sent === "boolean" ? reminder_sent : null,
        interview_substatus ?? null,
        typeof interview_completed_at === "string" ? interview_completed_at : null,
        typeof interview_status_note === "string" ? interview_status_note : null,
        interview_attendee_emails === undefined ? null : JSON.stringify(interview_attendee_emails),
        userId,
      ]
    );
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) throw error;
    return await query(
      `
      UPDATE applications
      SET stage = COALESCE($2::text, COALESCE(applications.stage, applications.status, 'Applied')),
          status = COALESCE($2::text, COALESCE(applications.status, applications.stage, 'Applied')),
          interview_scheduled = CASE WHEN $3::boolean IS NULL THEN COALESCE(interview_scheduled, FALSE) ELSE $3::boolean END,
          interview_datetime = CASE WHEN $4::timestamptz IS NULL THEN interview_datetime ELSE $4::timestamptz END,
          updated_at = NOW()
      WHERE id = $1 AND (${accessWhere5})
      RETURNING
        id,
        candidate_id,
        job_id,
        COALESCE(stage, status, 'Applied') AS stage,
        updated_at,
        COALESCE(interview_scheduled, FALSE) AS interview_scheduled,
        interview_datetime,
        NULL::text AS interview_reschedule_reason,
        NULL::text AS interview_cancel_reason,
        FALSE AS interview_no_show,
        FALSE AS reminder_sent,
        NULL::text AS interview_substatus,
        NULL::timestamptz AS interview_completed_at,
        NULL::text AS interview_status_note,
        '[]'::jsonb AS interview_attendee_emails,
        NULL::text AS calendar_provider,
        NULL::text AS external_calendar_event_id,
        NULL::text AS meet_link,
        NULL::text AS calendar_organizer_email,
        NULL::timestamptz AS calendar_last_synced_at,
        NULL::text AS calendar_sync_status,
        NULL::text AS calendar_sync_error,
        NULL::bigint AS current_interview_round_id,
        NULL::int AS current_interview_round_order,
        'not_started'::text AS interview_round_status,
        NULL::int AS rejected_in_round_order,
        NULL::int AS selected_after_rounds,
        NULL::text AS final_outcome
      `,
      [
        id,
        stage ?? null,
        typeof interview_scheduled === "boolean" ? interview_scheduled : null,
        typeof interview_datetime === "string" ? interview_datetime : null,
        userId,
      ]
    );
  }
}

async function persistApplicationCalendarState(input: {
  applicationId: number;
  userId: number;
  accessWhere2: string;
  calendar_provider: string | null;
  external_calendar_event_id: string | null;
  meet_link: string | null;
  calendar_organizer_email: string | null;
  calendar_last_synced_at: string | null;
  calendar_sync_status: string | null;
  calendar_sync_error: string | null;
  interview_attendee_emails: string[];
}) {
  const res = await query(
    `
    UPDATE applications
    SET
      calendar_provider = $3,
      external_calendar_event_id = $4,
      meet_link = $5,
      calendar_organizer_email = $6,
      calendar_last_synced_at = $7::timestamptz,
      calendar_sync_status = $8,
      calendar_sync_error = $9,
      interview_attendee_emails = $10::jsonb,
      updated_at = NOW()
    WHERE id = $1 AND (${input.accessWhere2})
    RETURNING *
    `,
    [
      input.applicationId,
      input.userId,
      input.calendar_provider,
      input.external_calendar_event_id,
      input.meet_link,
      input.calendar_organizer_email,
      input.calendar_last_synced_at,
      input.calendar_sync_status,
      input.calendar_sync_error,
      JSON.stringify(input.interview_attendee_emails),
    ]
  );
  return res;
}

async function loadInterviewMeetingContext(applicationId: number, userId: number, accessWhere2: string) {
  const res = await query(
    `
    SELECT
      a.id,
      a.job_id,
      a.stage,
      a.interview_datetime,
      a.interview_attendee_emails,
      a.external_calendar_event_id,
      a.meet_link,
      c.full_name AS candidate_full_name,
      c.email AS candidate_email,
      j.title AS job_title
    FROM applications a
    JOIN candidates c ON c.id = a.candidate_id
    JOIN jobs j ON j.id = a.job_id
    WHERE a.id = $1 AND (${accessWhere2})
    LIMIT 1
    `,
    [applicationId, userId]
  );
  return (res.rows?.[0] as
    | {
        id: number;
        job_id: number;
        stage: string;
        interview_datetime: string | null;
        interview_attendee_emails: unknown;
        external_calendar_event_id: string | null;
        meet_link: string | null;
        candidate_full_name: string | null;
        candidate_email: string | null;
        job_title: string | null;
      }
    | undefined) ?? null;
}

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("pipeline.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const url = new URL(request.url);
    const q = (url?.searchParams.get("q") ?? "").trim();
    const stageParam = (url?.searchParams.get("stage") ?? "").trim();
    const jobIdParam = (url?.searchParams.get("job_id") ?? "").trim();
    const companyParam = (url?.searchParams.get("company") ?? "").trim();
    const assignedToParam = (url?.searchParams.get("assigned_to") ?? "").trim();
    const interviewOverview = ["1", "true", "yes"].includes(
      (url?.searchParams.get("interview_overview") ?? "").trim().toLowerCase()
    );

    const where: string[] = [];
    const params: any[] = [];

    // Single-tenant org: anyone with pipeline.view sees all applications (not only creator / job_team).

    if (q.length > 0) {
      params.push(`%${q}%`);
      where.push(`c.full_name ILIKE $${params.length}`);
    }

    if (stageParam.length > 0) {
      if (!isStage(stageParam)) {
        return NextResponse.json(
          { error: `stage must be one of: ${STAGES.join(", ")}` },
          { status: 400 }
        );
      }
      params.push(stageParam);
      where.push(`a.stage = $${params.length}`);
    } else if (interviewOverview) {
      where.push(`(a.stage = 'Interview' OR a.rejected_in_round_order IS NOT NULL OR a.selected_after_rounds IS NOT NULL)`);
    }

    if (jobIdParam.length > 0) {
      const jobId = Number(jobIdParam);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return NextResponse.json({ error: "job_id must be a positive number" }, { status: 400 });
      }
      params.push(jobId);
      where.push(`a.job_id = $${params.length}`);
    }

    if (companyParam.length > 0) {
      params.push(companyParam.toLowerCase());
      where.push(`LOWER(TRIM(COALESCE(j.company, ''))) = $${params.length}`);
    }

    if (assignedToParam.length > 0 && assignedToParam !== "all") {
      const mine = assignedToParam.toLowerCase() === "me";
      const uid = mine ? user.user_id : Number(assignedToParam);
      if (!mine && (!Number.isFinite(uid) || uid <= 0)) {
        return NextResponse.json(
          { error: "assigned_to must be 'me', 'all', or a numeric user id" },
          { status: 400 }
        );
      }
      params.push(uid);
      where.push(`a.assigned_recruiter_user_id = $${params.length}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const result = await fetchApplicationsRows({
      whereClause: `${whereSql} ORDER BY a.updated_at DESC NULLS LAST, a.id DESC`,
      params,
    });

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Error fetching applications", error);
    return NextResponse.json({ error: "Failed to fetch applications" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const body = await request.json();
    const { candidate_id, job_id, stage, source, assigned_recruiter_user_id } = body as {
      candidate_id?: number;
      job_id?: number;
      stage?: Stage;
      source?: string;
      /** Defaults to current user (accountable owner). Pass null for unassigned. */
      assigned_recruiter_user_id?: number | null;
    };

    if (!candidate_id || !job_id) {
      return NextResponse.json(
        { error: "candidate_id and job_id are required" },
        { status: 400 }
      );
    }

    if (stage !== undefined && !isStage(stage)) {
      return NextResponse.json(
        { error: `stage must be one of: ${STAGES.join(", ")}` },
        { status: 400 }
      );
    }

    const appSource =
      typeof source === "string" && source.trim().length > 0 ? source.trim().slice(0, 80) : "UI";

    const ownerId =
      assigned_recruiter_user_id === null
        ? null
        : assigned_recruiter_user_id !== undefined && Number.isFinite(Number(assigned_recruiter_user_id))
          ? Number(assigned_recruiter_user_id)
          : user.user_id;

    if (ownerId !== null) {
      const uchk = await query(`SELECT 1 FROM users WHERE id = $1`, [ownerId]);
      if (!uchk.rowCount) {
        return NextResponse.json({ error: "assigned_recruiter_user_id is not a valid user" }, { status: 400 });
      }
    }

    const result = await query(
      `
      INSERT INTO applications (
        candidate_id,
        job_id,
        stage,
        status,
        updated_at,
        created_by_user_id,
        source,
        assigned_recruiter_user_id,
        current_interview_round_id,
        current_interview_round_order,
        interview_round_status
      )
      VALUES (
        $1,
        $2,
        COALESCE($3, 'Applied'),
        COALESCE($3, 'Applied'),
        NOW(),
        $4,
        $5,
        $6,
        NULL,
        NULL,
        CASE WHEN COALESCE($3, 'Applied') = 'Interview' THEN NULL ELSE 'not_started' END
      )
      ON CONFLICT (candidate_id, job_id) DO UPDATE
        SET stage = COALESCE(EXCLUDED.stage, applications.stage),
            status = COALESCE(EXCLUDED.stage, applications.status),
            updated_at = NOW(),
            assigned_recruiter_user_id = COALESCE(EXCLUDED.assigned_recruiter_user_id, applications.assigned_recruiter_user_id),
            current_interview_round_id = CASE
              WHEN COALESCE(EXCLUDED.stage, applications.stage) = 'Interview' THEN applications.current_interview_round_id
              ELSE NULL
            END,
            current_interview_round_order = CASE
              WHEN COALESCE(EXCLUDED.stage, applications.stage) = 'Interview' THEN applications.current_interview_round_order
              ELSE NULL
            END,
            interview_round_status = CASE
              WHEN COALESCE(EXCLUDED.stage, applications.stage) = 'Interview' THEN applications.interview_round_status
              ELSE 'not_started'
            END
      RETURNING id, candidate_id, job_id, stage, updated_at
      `,
      [candidate_id, job_id, stage ?? null, user.user_id, appSource, ownerId]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Error creating application", error);
    return NextResponse.json({ error: "Failed to create application" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  let committedStageMove:
    | {
        applicationId: number;
        userId: number;
        payload: Record<string, unknown>;
      }
    | null = null;
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const body = await request.json();
    const {
      id,
      stage,
      interview_scheduled,
      interview_datetime,
      interview_reschedule_reason,
      interview_cancel_reason,
        interview_no_show,
        interview_substatus,
        interview_status_note,
        interview_attendee_emails,
        reminder_sent,
        send_email,
      round_action,
      interview_decision,
      interview_decision_audience,
      stage_change_reason,
      disposition_reason_id,
      interview_duration_minutes,
      skip_google_sync,
    } = body as {
      id?: number;
      stage?: Stage;
      interview_scheduled?: boolean;
      interview_datetime?: string;
      interview_reschedule_reason?: string | null;
      interview_cancel_reason?: string | null;
        interview_no_show?: boolean;
        interview_substatus?: InterviewSubstatus | null;
        interview_status_note?: string | null;
        interview_attendee_emails?: string[] | string;
        reminder_sent?: boolean;
        send_email?: boolean;
      round_action?: "next" | "previous";
      interview_decision?: "next_round" | "final_selected" | "rejected";
      /** When `internal`, progress emails for interview decisions are skipped (audit still recorded). */
      interview_decision_audience?: "client" | "internal";
      stage_change_reason?: string | null;
      disposition_reason_id?: number;
      interview_duration_minutes?: number;
      skip_google_sync?: boolean;
    };

    const normalizedInterviewDurationMinutes =
      interview_duration_minutes === 15 ||
      interview_duration_minutes === 30 ||
      interview_duration_minutes === 45 ||
      interview_duration_minutes === 60
        ? interview_duration_minutes
        : 60;

    const decisionAudience: "client" | "internal" =
      interview_decision_audience === "internal" ? "internal" : "client";

    if (interview_substatus !== undefined && interview_substatus !== null && !isInterviewSubstatus(interview_substatus)) {
      return NextResponse.json(
        { error: `interview_substatus must be one of: ${INTERVIEW_SUBSTATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const assigned_recruiter_user_id = (body as { assigned_recruiter_user_id?: number | null }).assigned_recruiter_user_id;
    const hasTeam = await hasJobTeamTable();
    const accessWhere2 = applicationAccessPredicate("applications", "$2", hasTeam);
    const accessWhere4 = applicationAccessPredicate("applications", "$4", hasTeam);
      const accessWhere13 = applicationAccessPredicate("applications", "$13", hasTeam);
      const accessWhere5 = applicationAccessPredicate("applications", "$5", hasTeam);
    const accessWhereA2 = applicationAccessPredicate("a", "$2", hasTeam);

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const removeFromInterviewsBoard =
      (body as { remove_from_interviews_board?: boolean }).remove_from_interviews_board === true;

    if (removeFromInterviewsBoard) {
      const upd = await query(
        `
        UPDATE applications
        SET
          stage = 'Applied',
          status = 'Applied',
          interview_scheduled = FALSE,
          interview_datetime = NULL,
          interview_reschedule_reason = NULL,
          interview_cancel_reason = NULL,
          interview_no_show = FALSE,
          interview_substatus = NULL,
          interview_completed_at = NULL,
          interview_status_note = NULL,
          reminder_sent = FALSE,
          current_interview_round_id = NULL,
          current_interview_round_order = NULL,
          interview_round_status = 'not_started',
          rejected_in_round_order = NULL,
          selected_after_rounds = NULL,
          updated_at = NOW()
        WHERE id = $1
          AND stage = 'Interview'
          AND (${accessWhere2})
        RETURNING id, candidate_id
        `,
        [id, user.user_id]
      );
      if (upd.rowCount === 0) {
        return NextResponse.json(
          { error: "Application not found, not in Interview stage, or you lack access." },
          { status: 404 }
        );
      }
      const row0 = upd.rows[0] as { id: number; candidate_id: number };
      try {
        const existingMeeting = await loadInterviewMeetingContext(row0.id, user.user_id, accessWhereA2);
        if (existingMeeting?.external_calendar_event_id) {
          const syncResult = await syncInterviewMeeting({
            action: "cancel",
            applicationId: row0.id,
            title: existingMeeting.job_title || "Interview",
            candidateName: existingMeeting.candidate_full_name || "Candidate",
            candidateEmail: existingMeeting.candidate_email || null,
            interviewDatetime: existingMeeting.interview_datetime,
            internalAttendeeEmails: normalizeInterviewAttendeeEmails(existingMeeting.interview_attendee_emails),
            existingEventId: existingMeeting.external_calendar_event_id,
            existingMeetLink: existingMeeting.meet_link,
          });
          await persistApplicationCalendarState({
            applicationId: row0.id,
            userId: user.user_id,
            accessWhere2,
            calendar_provider: "google",
            external_calendar_event_id: syncResult.external_calendar_event_id,
            meet_link: syncResult.meet_link,
            calendar_organizer_email: syncResult.organizer_email,
            calendar_last_synced_at: syncResult.synced_at,
            calendar_sync_status: normalizeMeetingSyncStatus(syncResult.status),
            calendar_sync_error: syncResult.error,
            interview_attendee_emails: syncResult.attendee_emails,
          });
        }
      } catch (calendarError) {
        console.error("Failed to cancel Google Meet on interview board removal", calendarError);
      }
      try {
        await logScreeningAudit({
          event_type: "stage_override",
          application_id: row0.id,
          test_id: null,
          candidate_id: row0.candidate_id,
          created_by_user_id: user.user_id,
          metadata: {
            from_stage: "Interview",
            to_stage: "Applied",
            reason: "remove_from_interviews_board",
            interview_decision: null,
            interview_decision_audience: "client",
            explicit_stage_in_request: true,
          },
        });
      } catch {
        // non-fatal
      }
      const card = await safeFetchApplicationCardRow(row0.id, user.user_id);
      return NextResponse.json(card ?? { id: row0.id });
    }

    if (stage !== undefined && !isStage(stage)) {
      return NextResponse.json(
        { error: `stage must be one of: ${STAGES.join(", ")}` },
        { status: 400 }
      );
    }

    const onlyAssignRecruiter =
      assigned_recruiter_user_id !== undefined &&
      stage === undefined &&
      interview_scheduled === undefined &&
      interview_datetime === undefined &&
      interview_reschedule_reason === undefined &&
      interview_cancel_reason === undefined &&
        interview_no_show === undefined &&
        interview_substatus === undefined &&
        interview_status_note === undefined &&
        interview_attendee_emails === undefined &&
        reminder_sent === undefined &&
      send_email === undefined &&
      round_action === undefined &&
      interview_decision === undefined &&
      (body as { interview_decision_audience?: string }).interview_decision_audience === undefined &&
      stage_change_reason === undefined &&
      disposition_reason_id === undefined;

    if (onlyAssignRecruiter) {
      let rid: number | null = null;
      if (assigned_recruiter_user_id !== null) {
        rid = Number(assigned_recruiter_user_id);
        if (!Number.isFinite(rid) || rid <= 0) {
          return NextResponse.json({ error: "Invalid assigned_recruiter_user_id" }, { status: 400 });
        }
        const uchk = await query(`SELECT 1 FROM users WHERE id = $1`, [rid]);
        if (!uchk.rowCount) {
          return NextResponse.json({ error: "assigned_recruiter user not found" }, { status: 400 });
        }
      }
      const upd = await query(
        `
        UPDATE applications
        SET assigned_recruiter_user_id = $3, updated_at = NOW()
        WHERE id = $1 AND (${accessWhere2})
        RETURNING id
        `,
        [id, user.user_id, rid]
      );
      if (upd.rowCount === 0) {
        return NextResponse.json({ error: "Application not found" }, { status: 404 });
      }
      const card = await safeFetchApplicationCardRow(Number(id), user.user_id);
      if (!card) {
        return NextResponse.json({ error: "Application not found" }, { status: 404 });
      }
      return NextResponse.json(card);
    }

    // Used to ensure scheduled email is only sent once on the transition to Interview+interview_scheduled=true.
    const prev = await loadPreviousApplicationState(id, user.user_id, accessWhereA2);
    if (prev.rowCount === 0) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    const prevRow0 = prev.rows[0] as {
      stage: string;
      interview_scheduled: boolean;
      interview_datetime: string | null;
      prev_interview_substatus: InterviewSubstatus | null;
      prev_interview_completed_at: string | null;
      prev_interview_status_note: string | null;
      prev_interview_attendee_emails: unknown;
      prev_external_calendar_event_id: string | null;
      prev_meet_link: string | null;
      prev_calendar_sync_status: string | null;
      prev_calendar_sync_error: string | null;
      prev_calendar_organizer_email: string | null;
      prev_job_id: number;
      prev_round_id: number | null;
      prev_round_order: number | null;
      prev_round_label: string | null;
      prev_round_status: string | null;
    };
    const prevInterviewScheduled = Boolean(prevRow0.interview_scheduled);
    const prevInterviewDatetime = (prevRow0.interview_datetime ?? null) as string | null;
    const prevStage = (prevRow0.stage ?? null) as Stage | null;
    const prevInterviewSubstatus = prevRow0.prev_interview_substatus ?? null;
    const prevInterviewCompletedAt = prevRow0.prev_interview_completed_at ?? null;
    const prevInterviewStatusNote = prevRow0.prev_interview_status_note ?? null;
    const prevInterviewAttendeeEmails = normalizeInterviewAttendeeEmails(prevRow0.prev_interview_attendee_emails);
    const prevExternalCalendarEventId = prevRow0.prev_external_calendar_event_id ?? null;
    const prevMeetLink = prevRow0.prev_meet_link ?? null;
    const prevCalendarSyncStatus = normalizeMeetingSyncStatus(prevRow0.prev_calendar_sync_status);
    const prevCalendarSyncError = prevRow0.prev_calendar_sync_error ?? null;
    const prevCalendarOrganizerEmail = prevRow0.prev_calendar_organizer_email ?? null;
    const prevRoundStatus = prevRow0.prev_round_status ?? null;

    const normalizedInterviewAttendeeEmails =
      interview_attendee_emails === undefined
        ? prevInterviewAttendeeEmails
        : normalizeInterviewAttendeeEmails(interview_attendee_emails);

    let normalizedInterviewSubstatus: InterviewSubstatus | null =
      interview_substatus === undefined ? prevInterviewSubstatus : interview_substatus;
    let normalizedInterviewCompletedAt: string | null =
      interview_substatus === undefined ? prevInterviewCompletedAt : null;
    let normalizedInterviewStatusNote: string | null =
      interview_status_note === undefined ? prevInterviewStatusNote : typeof interview_status_note === "string"
        ? interview_status_note.trim().slice(0, 2000)
        : null;

    if (stage !== undefined && stage !== "Interview") {
      normalizedInterviewSubstatus = null;
      normalizedInterviewCompletedAt = null;
      normalizedInterviewStatusNote = null;
    }
    if (interview_cancel_reason !== undefined) {
      normalizedInterviewSubstatus = interview_cancel_reason ? "cancelled" : normalizedInterviewSubstatus;
      normalizedInterviewCompletedAt = null;
    }
    if (typeof interview_no_show === "boolean" && interview_no_show) {
      normalizedInterviewSubstatus = "no_show";
      normalizedInterviewCompletedAt = null;
      normalizedInterviewStatusNote = normalizedInterviewStatusNote || "Marked as no-show";
    }
    if (normalizedInterviewSubstatus === "completed_followup") {
      normalizedInterviewCompletedAt = new Date().toISOString();
      normalizedInterviewStatusNote =
        normalizedInterviewStatusNote || "Interview completed — follow up for next round";
    }
    if (
      interview_substatus === undefined &&
      typeof interview_scheduled === "boolean" &&
      interview_scheduled === true &&
      typeof interview_datetime === "string"
    ) {
      normalizedInterviewSubstatus = "scheduled";
      normalizedInterviewCompletedAt = null;
      normalizedInterviewStatusNote = null;
    }
    if (
      interview_decision === "next_round" ||
      interview_decision === "final_selected" ||
      interview_decision === "rejected"
    ) {
      normalizedInterviewSubstatus = null;
      normalizedInterviewCompletedAt = null;
      normalizedInterviewStatusNote = null;
    }

    const willReject = stage === "Rejected" || interview_decision === "rejected";
    let validatedRejectionReasonId: number | null = null;
    if (willReject) {
      const rid = Number(disposition_reason_id);
      if (!Number.isFinite(rid) || rid <= 0) {
        return NextResponse.json(
          { error: "disposition_reason_id is required when moving a candidate to Rejected or recording an interview rejection" },
          { status: 400 }
        );
      }
      const v = await validateDispositionReason(rid, ["reject", "withdraw"]);
      if (!v.ok) {
        return NextResponse.json({ error: v.error }, { status: 400 });
      }
      validatedRejectionReasonId = rid;
    }

    const result = await updateApplicationStageCore({
      id,
      stage,
      interview_scheduled,
      interview_datetime,
      interview_reschedule_reason,
      interview_cancel_reason,
      interview_no_show,
      reminder_sent,
      interview_substatus: normalizedInterviewSubstatus,
      interview_completed_at: normalizedInterviewCompletedAt,
      interview_status_note: normalizedInterviewStatusNote,
      interview_attendee_emails: normalizedInterviewAttendeeEmails,
      userId: user.user_id,
      accessWhere13,
      accessWhere5,
    });

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const updated = result.rows[0] as {
      id: number;
      candidate_id: number;
      job_id: number;
      stage: Stage;
      updated_at: string;
      interview_scheduled: boolean;
      interview_datetime: string | null;
      interview_reschedule_reason: string | null;
      interview_cancel_reason: string | null;
      interview_no_show: boolean;
      reminder_sent: boolean;
      interview_substatus: InterviewSubstatus | null;
      interview_completed_at: string | null;
      interview_status_note: string | null;
      interview_attendee_emails: unknown;
      calendar_provider: string | null;
      external_calendar_event_id: string | null;
      meet_link: string | null;
      calendar_organizer_email: string | null;
      calendar_last_synced_at: string | null;
      calendar_sync_status: string | null;
      calendar_sync_error: string | null;
      current_interview_round_id: number | null;
      current_interview_round_order: number | null;
      interview_round_status: string;
      rejected_in_round_order: number | null;
      selected_after_rounds: number | null;
      final_outcome: string | null;
    };
    committedStageMove = {
      applicationId: updated.id,
      userId: user.user_id,
      payload: updated as unknown as Record<string, unknown>,
    };

    const effectiveRoundAction = interview_decision === "next_round" ? "next" : round_action;

    if (updated.stage === "Interview" && !updated.current_interview_round_id) {
      // If enterprise interview-round tables are available, bootstrap the first round.
      // Older Railway DBs may not have these tables/columns yet, so don't block stage moves.
      try {
        const roundCountRes = await query(
          `
          SELECT COUNT(*)::int AS round_count
          FROM job_interview_rounds
          WHERE job_id = $1
          `,
          [updated.job_id]
        );
        const roundCount = Number(roundCountRes.rows?.[0]?.round_count || 0);
        if (roundCount === 0) {
          await query(
            `
            INSERT INTO job_interview_rounds (job_id, round_key, round_label, round_order, is_final, created_by_user_id)
            VALUES
              ($1, 'round_1', 'Round 1', 1, FALSE, $2),
              ($1, 'round_2', 'Round 2', 2, FALSE, $2),
              ($1, 'final', 'Final', 3, TRUE, $2)
            ON CONFLICT (job_id, round_key) DO NOTHING
            `,
            [updated.job_id, user.user_id]
          );
        }

        const firstRound = await query(
          `
          SELECT id, round_order
          FROM job_interview_rounds
          WHERE job_id = $1
          ORDER BY round_order ASC, id ASC
          LIMIT 1
          `,
          [updated.job_id]
        );
        if (firstRound.rowCount > 0) {
          const setFirst = await query(
            `
            UPDATE applications
            SET current_interview_round_id = $2,
                current_interview_round_order = $3,
                interview_round_status = 'in_progress',
                updated_at = NOW()
            WHERE id = $1 AND (${accessWhere4})
            RETURNING *
            `,
            [updated.id, firstRound.rows[0].id, firstRound.rows[0].round_order, user.user_id]
          );
          if (setFirst.rowCount > 0) Object.assign(updated, setFirst.rows[0]);
        }
      } catch (e) {
        if (!isSchemaCompatibilityError(e)) throw e;
      }
    }

    // Only after we have a valid current round should we move to next/previous.
    let roundStepRowCount = 0;
    if (updated.stage === "Interview" && (effectiveRoundAction === "next" || effectiveRoundAction === "previous")) {
      const op = effectiveRoundAction === "next" ? ">" : "<";
      const dir = effectiveRoundAction === "next" ? "ASC" : "DESC";
      const step = await query(
        `
        WITH current_app AS (
          SELECT id, job_id, COALESCE(current_interview_round_order, 0) AS current_order
          FROM applications
          WHERE id = $1 AND (${accessWhere2})
        ),
        target AS (
          SELECT r.id, r.round_order
          FROM job_interview_rounds r
          JOIN current_app c ON c.job_id = r.job_id
          WHERE r.round_order ${op} c.current_order
          ORDER BY r.round_order ${dir}, r.id ${dir}
          LIMIT 1
        )
        UPDATE applications a
        SET current_interview_round_id = t.id,
            current_interview_round_order = t.round_order,
            interview_round_status = 'in_progress',
            updated_at = NOW()
        FROM target t
        WHERE a.id = $1
          AND (${accessWhereA2})
        RETURNING a.*
        `,
        [updated.id, user.user_id]
      );
      roundStepRowCount = step.rowCount ?? 0;
      if (roundStepRowCount > 0) Object.assign(updated, step.rows[0]);
    }

    // "Client confirmed – next round" at the last configured round (e.g. Final): add another round
    // so recruiters can keep advancing until they explicitly mark selected.
    if (
      interview_decision === "next_round" &&
      updated.stage === "Interview" &&
      effectiveRoundAction === "next" &&
      roundStepRowCount === 0
    ) {
      try {
        const extend = await query(
          `
          WITH mx AS (
            SELECT COALESCE(MAX(round_order), 0)::int AS m
            FROM job_interview_rounds
            WHERE job_id = $1
          ),
          ins AS (
            INSERT INTO job_interview_rounds (job_id, round_key, round_label, round_order, is_final, created_by_user_id)
            SELECT $1,
                   'ext_' || replace(gen_random_uuid()::text, '-', ''),
                   'Round ' || (mx.m + 1)::text,
                   mx.m + 1,
                   FALSE,
                   $2
            FROM mx
            WHERE mx.m >= 1
            RETURNING id, round_order
          )
          UPDATE applications a
          SET current_interview_round_id = ins.id,
              current_interview_round_order = ins.round_order,
              interview_round_status = 'in_progress',
              updated_at = NOW()
          FROM ins
          WHERE a.id = $3
            AND (${accessWhereA2})
          RETURNING a.*
          `,
          [updated.job_id, user.user_id, updated.id]
        );
        if (extend.rowCount && extend.rowCount > 0) Object.assign(updated, extend.rows[0]);
      } catch (e) {
        if (!isSchemaCompatibilityError(e)) throw e;
      }
    }

    // Per-candidate interview round history
    if (updated.stage === "Interview") {
      const po = prevRow0.prev_round_order ?? null;
      const pid = prevRow0.prev_round_id ?? null;
      const pn = updated.current_interview_round_order ?? null;
      const nid = updated.current_interview_round_id ?? null;
      const roundChanged =
        (po ?? -1) !== (pn ?? -1) || (pid ?? -1) !== (nid ?? -1);
      if (roundChanged) {
        try {
          let newLabel: string | null = null;
          if (nid) {
            const lr = await query(`SELECT round_label FROM job_interview_rounds WHERE id = $1`, [nid]);
            newLabel = (lr.rows[0] as { round_label?: string } | undefined)?.round_label ?? null;
          }
          let evType = "round_step";
          if (interview_decision === "next_round") evType = "next_round";
          else if (effectiveRoundAction === "previous") evType = "previous_round";
          else if (effectiveRoundAction === "next") evType = "next_round";

          await query(
            `
            INSERT INTO application_interview_round_events (
              application_id, job_id,
              previous_round_order, new_round_order,
              previous_round_label, new_round_label,
              event_type, audience, created_by_user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `,
            [
              updated.id,
              updated.job_id,
              po,
              pn,
              prevRow0.prev_round_label,
              newLabel,
              evType,
              decisionAudience,
              user.user_id,
            ]
          );
        } catch (e) {
          if (!isSchemaCompatibilityError(e)) throw e;
        }
      }
    }

    // Enterprise tracking: write timeline entry when a candidate first enters Interview.
    // This prevents the candidate profile timeline from missing Interview transitions
    // once `activity_timeline` already has rows (fallback won't be used then).
    if (updated.stage === "Interview" && prevStage !== "Interview") {
      const roundOrder = updated.current_interview_round_order;
      const message = roundOrder ? `Moved to Interview (Round ${roundOrder})` : "Moved to Interview";
      try {
        await query(
          `
          INSERT INTO activity_timeline (user_id, candidate_id, application_id, event_type, message, metadata)
          VALUES ($1, $2, $3, 'Interview', $4, '{}'::jsonb)
          `,
          [user.user_id, updated.candidate_id, updated.id, message]
        );
      } catch (e) {
        // If enterprise tables/columns aren't present yet, don't block pipeline actions.
        if (!isSchemaCompatibilityError(e)) throw e;
      }
    }

    if (interview_decision === "final_selected") {
      try {
        const done = await query(
          `
          UPDATE applications
          SET stage = 'Selected',
              status = 'Selected',
              selected_after_rounds = COALESCE(current_interview_round_order, selected_after_rounds),
              final_outcome = 'selected',
              interview_round_status = 'completed',
              interview_substatus = NULL,
              interview_completed_at = NULL,
              interview_status_note = NULL,
              updated_at = NOW()
          WHERE id = $1 AND (${accessWhere2})
          RETURNING *
          `,
          [updated.id, user.user_id]
        );
        if (done.rowCount > 0) Object.assign(updated, done.rows[0]);
      } catch (e) {
        if (!isSchemaCompatibilityError(e)) throw e;
        const done = await query(
          `
          UPDATE applications
          SET stage = 'Selected',
              status = 'Selected',
              updated_at = NOW()
          WHERE id = $1 AND (${accessWhere2})
          RETURNING *
          `,
          [updated.id, user.user_id]
        );
        if (done.rowCount > 0) Object.assign(updated, done.rows[0]);
      }
    }

    if (interview_decision === "rejected") {
      try {
        const done = await query(
          `
          UPDATE applications
          SET stage = 'Rejected',
              status = 'Rejected',
              rejected_in_round_order = COALESCE(current_interview_round_order, rejected_in_round_order),
              final_outcome = 'rejected',
              interview_round_status = 'rejected',
              interview_substatus = NULL,
              interview_completed_at = NULL,
              interview_status_note = NULL,
              updated_at = NOW()
          WHERE id = $1 AND (${accessWhere2})
          RETURNING *
          `,
          [updated.id, user.user_id]
        );
        if (done.rowCount > 0) Object.assign(updated, done.rows[0]);
      } catch (e) {
        if (!isSchemaCompatibilityError(e)) throw e;
        const done = await query(
          `
          UPDATE applications
          SET stage = 'Rejected',
              status = 'Rejected',
              updated_at = NOW()
          WHERE id = $1 AND (${accessWhere2})
          RETURNING *
          `,
          [updated.id, user.user_id]
        );
        if (done.rowCount > 0) Object.assign(updated, done.rows[0]);
      }
    }

    const movedAppliedToScreening = prevStage === "Applied" && updated.stage === "Screening";
    const movedAppliedToInterview = prevStage === "Applied" && updated.stage === "Interview";

    if (movedAppliedToScreening) {
      try {
        const origin = new URL(request.url).origin;
        await createAndSendScreeningTest({
          applicationId: updated.id,
          userId: Number(user.user_id),
          origin,
          reason: "auto",
          sendEmail: send_email === true,
        });
      } catch (e) {
        console.error("Failed to auto-trigger screening test", e);
      }
    }

    if (movedAppliedToInterview) {
      try {
        await query(
          `
          INSERT INTO candidate_activity (candidate_id, type, description, created_at)
          VALUES ($1, 'Screening', 'Screening Skipped', NOW())
          `,
          [updated.candidate_id]
        );
      } catch {
        // optional table guard
      }
    }

    let calendarSyncStatus = prevCalendarSyncStatus;
    let calendarSyncError = prevCalendarSyncError;
    let meetLink = prevMeetLink;
    let externalCalendarEventId = prevExternalCalendarEventId;
    let calendarOrganizerEmail = prevCalendarOrganizerEmail;
    let calendarProvider = prevExternalCalendarEventId || prevMeetLink || prevCalendarSyncStatus ? "google" : null;
    let calendarLastSyncedAt: string | null = null;

    const shouldUpsertGoogleMeeting =
      skip_google_sync !== true &&
      updated.stage === "Interview" &&
      updated.interview_scheduled === true &&
      updated.interview_substatus !== "completed_followup" &&
      updated.interview_substatus !== "no_show" &&
      updated.interview_substatus !== "cancelled" &&
      Boolean(updated.interview_datetime) &&
      (
        typeof interview_datetime === "string" ||
        typeof interview_scheduled === "boolean" ||
        interview_attendee_emails !== undefined ||
        prevExternalCalendarEventId != null
      );

    const shouldCancelGoogleMeeting =
      prevExternalCalendarEventId != null &&
      (
        removeFromInterviewsBoard ||
        interview_cancel_reason !== undefined ||
        (updated.stage === "Interview" &&
          (updated.interview_substatus === "cancelled" ||
            updated.interview_scheduled === false ||
            !updated.interview_datetime))
      );

    // isReschedule must be computed before the sync block so inviteMode can be derived.
    const isRescheduleForSync = prevInterviewDatetime !== null;

    if (shouldUpsertGoogleMeeting || shouldCancelGoogleMeeting) {
      const meetingContext = await loadInterviewMeetingContext(updated.id, user.user_id, accessWhereA2);
      if (meetingContext) {
        const calendarInviteMode = isRescheduleForSync ? "rescheduled" : "scheduled";
        const calendarInviteSubject = isRescheduleForSync
          ? `Rescheduled: ${meetingContext.job_title || "Interview"} – ${meetingContext.candidate_full_name || "Candidate"}`
          : `${meetingContext.job_title || "Interview"} – ${meetingContext.candidate_full_name || "Candidate"}`;
        const calendarInviteBody = isRescheduleForSync
          ? `Your interview for the ${meetingContext.job_title || "role"} has been rescheduled. Please use this updated calendar invite.`
          : `Your interview for the ${meetingContext.job_title || "role"} has been scheduled. Please join using the Google Meet link in this invite.`;

        const syncResult = await syncInterviewMeeting({
          action: shouldCancelGoogleMeeting ? "cancel" : "upsert",
          applicationId: updated.id,
          title: meetingContext.job_title || "Interview",
          candidateName: meetingContext.candidate_full_name || "Candidate",
          candidateEmail: meetingContext.candidate_email || null,
          interviewDatetime: meetingContext.interview_datetime,
          internalAttendeeEmails: normalizedInterviewAttendeeEmails,
          existingEventId: prevExternalCalendarEventId,
          existingMeetLink: prevMeetLink,
          notes: normalizedInterviewStatusNote,
          durationMinutes: normalizedInterviewDurationMinutes,
          inviteMode: calendarInviteMode,
          inviteSubject: calendarInviteSubject,
          inviteBody: calendarInviteBody,
        });

        calendarSyncStatus = normalizeMeetingSyncStatus(syncResult.status);
        calendarSyncError = syncResult.error;
        meetLink = syncResult.meet_link;
        externalCalendarEventId = syncResult.external_calendar_event_id;
        calendarOrganizerEmail = syncResult.organizer_email;
        calendarProvider = syncResult.source === "google_calendar" || syncResult.status !== "google_not_connected" ? "google" : calendarProvider;
        calendarLastSyncedAt = syncResult.synced_at;

        const persistedCalendar = await persistApplicationCalendarState({
          applicationId: updated.id,
          userId: user.user_id,
          accessWhere2,
          calendar_provider: calendarProvider,
          external_calendar_event_id: externalCalendarEventId,
          meet_link: meetLink,
          calendar_organizer_email: calendarOrganizerEmail,
          calendar_last_synced_at: calendarLastSyncedAt,
          calendar_sync_status: calendarSyncStatus,
          calendar_sync_error: calendarSyncError,
          interview_attendee_emails: syncResult.attendee_emails,
        });
        if (persistedCalendar.rowCount > 0) {
          Object.assign(updated, persistedCalendar.rows[0]);
        }
      }
    }

    const prevMs = prevInterviewDatetime ? new Date(prevInterviewDatetime).getTime() : null;
    const updatedMs = updated.interview_datetime ? new Date(updated.interview_datetime).getTime() : null;
    const interviewDatetimeChanged =
      prevMs !== null && updatedMs !== null ? prevMs !== updatedMs : true;

    const isReschedule = prevInterviewDatetime !== null;
    const isSchedule = prevInterviewScheduled === false;
    const googleInviteHandled =
      calendarSyncStatus === "meet_created" || calendarSyncStatus === "invite_sent";

    const shouldSendScheduledEmail =
      updated.stage === "Interview" &&
      updated.interview_scheduled === true &&
      updated.interview_substatus !== "completed_followup" &&
      updated.interview_substatus !== "no_show" &&
      updated.interview_substatus !== "cancelled" &&
      !!updated.interview_datetime &&
      send_email === true &&
      !googleInviteHandled &&
      ((isSchedule === true) || (isReschedule === true && interviewDatetimeChanged === true));

    // Expire interview alerts when interview is no longer active/scheduled.
    if (
      updated.stage !== "Interview" ||
      updated.interview_scheduled !== true ||
      updated.interview_substatus === "completed_followup" ||
      updated.interview_substatus === "no_show" ||
      updated.interview_substatus === "cancelled"
    ) {
      try {
        await query(
          `
          UPDATE alerts
          SET status = 'expired'
          WHERE user_id = $1
            AND application_id = $2
            AND status = 'unread'
          `,
          [user.user_id, updated.id]
        );
      } catch (e: any) {
        if (e?.code !== "42P01" && e?.code !== "42703") {
          console.error("Failed to expire interview alerts", e);
        }
      }
    }

    const becameInterviewCompleted =
      updated.stage === "Interview" &&
      updated.interview_substatus === "completed_followup" &&
      prevInterviewSubstatus !== "completed_followup";

    if (becameInterviewCompleted) {
      try {
        const recipientIds = Array.from(
          new Set(
            [user.user_id, (body as { assigned_recruiter_user_id?: number | null }).assigned_recruiter_user_id]
              .filter((value) => Number.isFinite(Number(value)) && Number(value) > 0)
              .map((value) => Number(value))
          )
        );

        const candidateInfo = await query(
          `
          SELECT c.full_name AS candidate_full_name
          FROM candidates c
          WHERE c.id = $1
          LIMIT 1
          `,
          [updated.candidate_id]
        );
        const candidateName = String(candidateInfo.rows?.[0]?.candidate_full_name || "Candidate");

        for (const recipientId of recipientIds) {
          await query(
            `
            INSERT INTO alerts (user_id, application_id, type, message, status, created_at, expires_at, read_at)
            VALUES ($1, $2, 'interview_complete', $3, 'unread', NOW(), NOW() + INTERVAL '30 days', NULL)
            ON CONFLICT (user_id, application_id, type)
            DO UPDATE SET
              message = EXCLUDED.message,
              status = 'unread',
              created_at = NOW(),
              expires_at = EXCLUDED.expires_at,
              read_at = NULL
            `,
            [recipientId, updated.id, `Interview complete for ${candidateName}`]
          );
        }
      } catch (e: any) {
        if (e?.code !== "42P01" && e?.code !== "42703") {
          console.error("Failed to create interview completion alert", e);
        }
      }
    }

    const becameNoShow =
      updated.stage === "Interview" &&
      updated.interview_substatus === "no_show" &&
      prevInterviewSubstatus !== "no_show";

    if (becameInterviewCompleted || becameNoShow) {
      const message = becameInterviewCompleted
        ? "Interview completed — follow up for next round"
        : "Interview marked no-show";
      try {
        await query(
          `
          INSERT INTO candidate_activity (candidate_id, type, description, created_at)
          VALUES ($1, 'Interview', $2, NOW())
          `,
          [updated.candidate_id, message]
        );
      } catch {
        // optional legacy table
      }
      try {
        await query(
          `
          INSERT INTO activity_timeline (user_id, candidate_id, application_id, event_type, message, metadata)
          VALUES ($1, $2, $3, 'Interview', $4, '{}'::jsonb)
          `,
          [user.user_id, updated.candidate_id, updated.id, message]
        );
      } catch (e) {
        if (!isSchemaCompatibilityError(e)) throw e;
      }
    }

    if (shouldSendScheduledEmail) {
      try {
        console.log("[interview-schedule-email] sending scheduled email", {
          applicationId: updated.id,
          candidateId: updated.candidate_id,
          interviewDatetime: updated.interview_datetime,
          prevInterviewScheduled,
        });
        if (!process.env.RESEND_API_KEY && !process.env.SMTP_HOST) {
          console.error("Missing email provider config; cannot send scheduled interview email.");
        } else {

          const candidateInfo = await query(
            `
            SELECT
              c.email AS candidate_email,
              c.full_name AS candidate_full_name,
              j.title AS job_title,
              j.description AS job_description
            FROM applications a
            JOIN candidates c ON c.id = a.candidate_id
            JOIN jobs j ON j.id = a.job_id
            WHERE a.id = $1 AND (${applicationAccessPredicate("a", "$2", hasTeam)})
            `,
            [updated.id, user.user_id]
          );

          const candidateEmail = candidateInfo.rows?.[0]?.candidate_email as string | null | undefined;
          const candidateName = candidateInfo.rows?.[0]?.candidate_full_name as string | null | undefined;
          const jobTitle = candidateInfo.rows?.[0]?.job_title as string | null | undefined;
          const jobDescription = candidateInfo.rows?.[0]?.job_description as string | null | undefined;

          if (candidateEmail) {
            const subject = "Interview Scheduled - Aasthix Talent";
            const when = formatEmailDateTime(updated.interview_datetime);
            const roleText = jobTitle || "-";
            const whenText = when || "-";
            const descriptionText = jobDescription ? jobDescription : "Not provided";

            const emailBody = buildCandidateEmailTemplate({
              candidateName: candidateName || "there",
              paragraphs: isReschedule
                ? [
                    "We would like to inform you that your interview has been rescheduled. The new time window is provided below.",
                    `Interview Date & Time: ${whenText}`,
                  ]
                : ["Thanks for your application.", `Your interview has been scheduled for ${whenText}.`],
              job: {
                title: roleText,
                description: descriptionText,
              },
            });
            const sendResult = await sendEmailMessage({
              to: [candidateEmail],
              subject,
              html: emailBody.html,
              text: emailBody.text,
            });
            if (!sendResult.sent) {
              throw new Error(sendResult.detail || "Failed to send scheduled interview email");
            }
            console.log("[interview-schedule-email] email sent", {
              applicationId: updated.id,
              to: candidateEmail,
            });
          } else {
            console.error(`No candidate email found for application ${updated.id}.`);
          }
        }
      } catch (err) {
        console.error("Failed to prepare or send scheduled interview email:", err);
      }
    }

    const shouldSendProgressEmail =
      send_email === true &&
      decisionAudience === "client" &&
      (interview_decision === "next_round" ||
        interview_decision === "final_selected" ||
        interview_decision === "rejected");
    if (shouldSendProgressEmail) {
      try {
        if (process.env.RESEND_API_KEY || process.env.SMTP_HOST) {
          const candidateInfo = await query(
            `
            SELECT c.email AS candidate_email, c.full_name AS candidate_full_name, j.title AS job_title
            FROM applications a
            JOIN candidates c ON c.id = a.candidate_id
            JOIN jobs j ON j.id = a.job_id
            WHERE a.id = $1 AND (${applicationAccessPredicate("a", "$2", hasTeam)})
            LIMIT 1
            `,
            [updated.id, user.user_id]
          );
          const candidateEmail = candidateInfo.rows?.[0]?.candidate_email as string | null | undefined;
          if (candidateEmail) {
            const subject =
              interview_decision === "final_selected"
                ? "Final Confirmation - Selected"
                : interview_decision === "rejected"
                  ? "Interview Update"
                  : "Interview Round Update";
            const message =
              interview_decision === "final_selected"
                ? "This is final confirmation that you are selected. We will share the next steps shortly."
                : interview_decision === "rejected"
                  ? `Your profile was not selected in ${
                      updated.rejected_in_round_order ? `Round ${updated.rejected_in_round_order}` : "the current round"
                    }.`
                  : `Congratulations! You are confirmed for ${
                      updated.current_interview_round_order ? `Round ${updated.current_interview_round_order}` : "the next round"
                    }. We will share the info shortly.`;
            const emailBody = buildCandidateEmailTemplate({
              candidateName: candidateInfo.rows?.[0]?.candidate_full_name || "Candidate",
              paragraphs: [message],
              job: {
                title: candidateInfo.rows?.[0]?.job_title as string | undefined,
              },
            });
            const sendResult = await sendEmailMessage({
              to: [candidateEmail],
              subject,
              text: emailBody.text,
              html: emailBody.html,
            });
            if (!sendResult.sent) {
              throw new Error(sendResult.detail || "Failed to send progress email");
            }
          }
        }
      } catch (err) {
        console.error("Failed to prepare or send progress email:", err);
      }
    }

    if (prevStage !== null && prevStage !== updated.stage) {
      await logScreeningAudit({
        event_type: "stage_override",
        application_id: updated.id,
        test_id: null,
        candidate_id: updated.candidate_id,
        created_by_user_id: user.user_id,
        metadata: {
          from_stage: prevStage,
          to_stage: updated.stage,
          reason: typeof stage_change_reason === "string" ? stage_change_reason.slice(0, 2000) : null,
          interview_decision: interview_decision ?? null,
          interview_decision_audience: decisionAudience,
          explicit_stage_in_request: stage !== undefined,
        },
      });
    }

    const becameRejected = updated.stage === "Rejected" && prevStage !== "Rejected";
    if (becameRejected && validatedRejectionReasonId !== null) {
      try {
        await recordDispositionEvent({
          userId: user.user_id,
          entityType: "application",
          entityId: updated.id,
          reasonId: validatedRejectionReasonId,
          metadata: {
            from_stage: prevStage,
            interview_decision: interview_decision ?? null,
          },
        });
      } catch (e) {
        if (!isSchemaCompatibilityError(e)) throw e;
      }
    }

    const trackingEvents: Array<{ type: string; message: string }> = [];
    if (prevStage !== null && prevStage !== updated.stage) {
      trackingEvents.push({
        type: "stage_move",
        message: `Pipeline moved from ${prevStage} to ${updated.stage}`,
      });
    }
    if (
      updated.stage === "Interview" &&
      updated.interview_scheduled === true &&
      !!updated.interview_datetime &&
      interviewDatetimeChanged &&
      send_email === true
    ) {
      trackingEvents.push({
        type: isReschedule ? "interview_reschedule" : "interview_schedule",
        message: `${isReschedule ? "Interview rescheduled" : "Interview scheduled"} for ${formatEmailDateTime(updated.interview_datetime)}`,
      });
    }
    if (prevInterviewSubstatus !== updated.interview_substatus && updated.interview_substatus) {
      const labelMap: Record<string, string> = {
        scheduled: "Interview marked scheduled",
        completed_followup: "Interview completed (follow-up pending)",
        no_show: "Interview marked no-show",
        cancelled: "Interview cancelled",
      };
      trackingEvents.push({
        type: "interview_outcome",
        message: labelMap[updated.interview_substatus] || `Interview status updated to ${updated.interview_substatus}`,
      });
    }
    if (prevRoundStatus !== updated.interview_round_status && updated.interview_round_status) {
      trackingEvents.push({
        type: "record_updated",
        message: `Interview round status updated to ${updated.interview_round_status.replace(/_/g, " ")}`,
      });
    }
    if (calendarSyncStatus && calendarSyncStatus !== prevCalendarSyncStatus) {
      trackingEvents.push({
        type: "invite_sent",
        message:
          calendarSyncStatus === "invite_sent" || calendarSyncStatus === "meet_created"
            ? "Calendar invite synced and sent"
            : calendarSyncStatus === "calendar_event_cancelled"
              ? "Calendar invite cancelled"
              : calendarSyncStatus === "calendar_sync_failed"
                ? `Calendar sync failed${calendarSyncError ? `: ${calendarSyncError}` : ""}`
                : "Calendar connection unavailable",
      });
    }
    for (const event of trackingEvents) {
      await appendCandidateTrackingEvent({
        userId: user.user_id,
        candidateId: updated.candidate_id,
        applicationId: updated.id,
        type: event.type,
        message: event.message,
      });
    }

    const card = await safeFetchApplicationCardRow(updated.id, user.user_id);
    const payload = (card ?? updated) as Record<string, unknown>;
    const opStatus =
      calendarSyncStatus === "calendar_sync_failed"
        ? "partial"
        : calendarSyncStatus === "google_not_connected"
          ? "blocked"
          : "success";
    return NextResponse.json({
      ...payload,
      operation_status: opStatus,
      calendar_sync_status: calendarSyncStatus ?? null,
      email_send_status: send_email === true ? "requested" : "not_requested",
      next_action_hint:
        updated.interview_substatus === "completed_followup"
          ? "Review candidate outcome and move to next round decision."
          : updated.interview_substatus === "no_show"
            ? "Mark candidate follow-up plan or keep in interview queue."
            : "Continue workflow from Pipeline or Interviews desk.",
    });
  } catch (error) {
    console.error("Error updating application stage", error);
    if (committedStageMove) {
      const card = await safeFetchApplicationCardRow(committedStageMove.applicationId, committedStageMove.userId);
      return NextResponse.json(
        {
          ...(card ?? committedStageMove.payload),
          operation_status: "partial",
          user_message: "Stage updated, but some follow-up actions failed. Please refresh to confirm the latest state.",
          next_action_hint: "Pipeline stage move was committed. Review alerts/audit side-effects if this keeps happening.",
        },
        { status: 200 }
      );
    }
    // Surface the real DB/runtime error so it can be diagnosed without server log access.
    const errorDetail =
      error instanceof Error
        ? (error as Error & { code?: string }).code
          ? `[${(error as Error & { code?: string }).code}] ${error.message}`
          : error.message
        : String(error);
    return NextResponse.json({ error: `Failed to update application: ${errorDetail}` }, { status: 500 });
  }
}
