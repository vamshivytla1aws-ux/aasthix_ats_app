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

export const runtime = "nodejs";

const STAGES = ["Applied", "Screening", "Screening Failed", "Interview", "Selected", "Rejected"] as const;
type Stage = (typeof STAGES)[number];

function isStage(value: unknown): value is Stage {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value);
}

function formatEmailDateTime(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
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
        a.job_id AS prev_job_id,
        a.current_interview_round_id AS prev_round_id,
        a.current_interview_round_order AS prev_round_order,
        jir.round_label AS prev_round_label
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
        a.job_id AS prev_job_id,
        NULL::bigint AS prev_round_id,
        NULL::int AS prev_round_order,
        NULL::text AS prev_round_label
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
  userId: number;
  accessWhere9: string;
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
    userId,
    accessWhere9,
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
      WHERE id = $1 AND (${accessWhere9})
      RETURNING id, candidate_id, job_id, stage, updated_at, interview_scheduled, interview_datetime, interview_reschedule_reason, interview_cancel_reason, interview_no_show, reminder_sent, current_interview_round_id, current_interview_round_order, interview_round_status, rejected_in_round_order, selected_after_rounds, final_outcome
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
      WHERE id = $1 AND (${accessWhere9})
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

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("pipeline.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const url = new URL(request.url);
    const q = (url?.searchParams.get("q") ?? "").trim();
    const stageParam = (url?.searchParams.get("stage") ?? "").trim();
    const jobIdParam = (url?.searchParams.get("job_id") ?? "").trim();
    const assignedToParam = (url?.searchParams.get("assigned_to") ?? "").trim();

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
    }

    if (jobIdParam.length > 0) {
      const jobId = Number(jobIdParam);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return NextResponse.json({ error: "job_id must be a positive number" }, { status: 400 });
      }
      params.push(jobId);
      where.push(`a.job_id = $${params.length}`);
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
      reminder_sent,
      send_email,
      round_action,
      interview_decision,
      interview_decision_audience,
      stage_change_reason,
      disposition_reason_id,
    } = body as {
      id?: number;
      stage?: Stage;
      interview_scheduled?: boolean;
      interview_datetime?: string;
      interview_reschedule_reason?: string | null;
      interview_cancel_reason?: string | null;
      interview_no_show?: boolean;
      reminder_sent?: boolean;
      send_email?: boolean;
      round_action?: "next" | "previous";
      interview_decision?: "next_round" | "final_selected" | "rejected";
      /** When `internal`, progress emails for interview decisions are skipped (audit still recorded). */
      interview_decision_audience?: "client" | "internal";
      stage_change_reason?: string | null;
      disposition_reason_id?: number;
    };

    const decisionAudience: "client" | "internal" =
      interview_decision_audience === "internal" ? "internal" : "client";

    const assigned_recruiter_user_id = (body as { assigned_recruiter_user_id?: number | null }).assigned_recruiter_user_id;
    const hasTeam = await hasJobTeamTable();
    const accessWhere2 = applicationAccessPredicate("applications", "$2", hasTeam);
    const accessWhere4 = applicationAccessPredicate("applications", "$4", hasTeam);
    const accessWhere9 = applicationAccessPredicate("applications", "$9", hasTeam);
    const accessWhereA2 = applicationAccessPredicate("a", "$2", hasTeam);

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
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
    const prev = await loadPreviousApplicationState(id, user.user_id, accessWhere2);
    if (prev.rowCount === 0) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    const prevRow0 = prev.rows[0] as {
      stage: string;
      interview_scheduled: boolean;
      interview_datetime: string | null;
      prev_job_id: number;
      prev_round_id: number | null;
      prev_round_order: number | null;
      prev_round_label: string | null;
    };
    const prevInterviewScheduled = Boolean(prevRow0.interview_scheduled);
    const prevInterviewDatetime = (prevRow0.interview_datetime ?? null) as string | null;
    const prevStage = (prevRow0.stage ?? null) as Stage | null;

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
      userId: user.user_id,
      accessWhere9,
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
      current_interview_round_id: number | null;
      current_interview_round_order: number | null;
      interview_round_status: string;
      rejected_in_round_order: number | null;
      selected_after_rounds: number | null;
      final_outcome: string | null;
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

    const prevMs = prevInterviewDatetime ? new Date(prevInterviewDatetime).getTime() : null;
    const updatedMs = updated.interview_datetime ? new Date(updated.interview_datetime).getTime() : null;
    const interviewDatetimeChanged =
      prevMs !== null && updatedMs !== null ? prevMs !== updatedMs : true;

    const isReschedule = prevInterviewDatetime !== null;
    const isSchedule = prevInterviewScheduled === false;

    const shouldSendScheduledEmail =
      updated.stage === "Interview" &&
      updated.interview_scheduled === true &&
      !!updated.interview_datetime &&
      send_email === true &&
      ((isSchedule === true) || (isReschedule === true && interviewDatetimeChanged === true));

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

    // Expire interview alerts when interview is no longer active/scheduled.
    if (updated.stage !== "Interview" || updated.interview_scheduled !== true) {
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

    const card = await safeFetchApplicationCardRow(updated.id, user.user_id);
    return NextResponse.json(card ?? updated);
  } catch (error) {
    console.error("Error updating application stage", error);
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 });
  }
}
