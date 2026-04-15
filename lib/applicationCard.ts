import { query } from "@/lib/db";
import { applicationAccessPredicate, hasJobTeamTable } from "@/lib/applicationVisibility";

type QueryResultRow = Record<string, unknown>;

async function tryApplicationQuery(sql: string, params: unknown[], label: string) {
  try {
    return await query(sql, params);
  } catch (error) {
    console.warn(`[applicationCard] ${label} failed`, error);
    return null;
  }
}

async function fetchApplicationRowsInternal(whereClause: string, params: unknown[]) {
  const enhanced = await tryApplicationQuery(
    `
      SELECT
        a.id,
        a.candidate_id,
        a.job_id,
        a.stage,
        a.updated_at,
        a.interview_scheduled,
        a.interview_datetime,
        a.interview_reschedule_reason,
        a.interview_cancel_reason,
        a.interview_no_show,
        a.interview_substatus,
        a.interview_completed_at,
        a.interview_status_note,
        a.current_interview_round_id,
        a.current_interview_round_order,
        a.interview_round_status,
        a.rejected_in_round_order,
        a.selected_after_rounds,
        a.final_outcome,
        COALESCE(a.source, 'UI') AS application_source,
        a.assigned_recruiter_user_id,
        ru.full_name AS assigned_recruiter_name,
        jir.round_label AS current_interview_round_label,
        COALESCE(jrc.round_count, 0) AS interview_round_total,
        c.full_name AS candidate_full_name,
        c.email AS candidate_email,
        c.phone AS candidate_phone,
        j.title AS job_title,
        j.company AS job_company,
        j.location AS job_location,
        hist.interview_round_history
      FROM applications a
      JOIN candidates c ON c.id = a.candidate_id
      JOIN jobs j ON j.id = a.job_id
      LEFT JOIN users ru ON ru.id = a.assigned_recruiter_user_id
      LEFT JOIN job_interview_rounds jir ON jir.id = a.current_interview_round_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS round_count
        FROM job_interview_rounds jr
        WHERE jr.job_id = a.job_id
      ) jrc ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'previous_round_order', x.previous_round_order,
              'new_round_order', x.new_round_order,
              'previous_round_label', x.previous_round_label,
              'new_round_label', x.new_round_label,
              'event_type', x.event_type,
              'audience', x.audience,
              'created_at', x.created_at
            )
            ORDER BY x.created_at ASC
          ),
          '[]'::json
        ) AS interview_round_history
        FROM (
          SELECT e.previous_round_order, e.new_round_order, e.previous_round_label, e.new_round_label,
                 e.event_type, e.audience, e.created_at
          FROM application_interview_round_events e
          WHERE e.application_id = a.id
          ORDER BY e.created_at DESC
          LIMIT 12
        ) x
      ) hist ON true
      ${whereClause}
      `,
    params,
    "enhanced applications query"
  );
  if (enhanced) return enhanced;

  const compatibility = await tryApplicationQuery(
    `
      SELECT
        a.id,
        a.candidate_id,
        a.job_id,
        a.stage,
        a.updated_at,
        a.interview_scheduled,
        a.interview_datetime,
        NULL::text AS interview_reschedule_reason,
        NULL::text AS interview_cancel_reason,
        FALSE AS interview_no_show,
        NULL::text AS interview_substatus,
        NULL::timestamptz AS interview_completed_at,
        NULL::text AS interview_status_note,
        NULL::bigint AS current_interview_round_id,
        NULL::int AS current_interview_round_order,
        NULL::text AS interview_round_status,
        NULL::int AS rejected_in_round_order,
        NULL::int AS selected_after_rounds,
        NULL::text AS final_outcome,
        COALESCE(a.source, 'UI') AS application_source,
        NULL::bigint AS assigned_recruiter_user_id,
        NULL::text AS assigned_recruiter_name,
        NULL::text AS current_interview_round_label,
        0::int AS interview_round_total,
        c.full_name AS candidate_full_name,
        c.email AS candidate_email,
        c.phone AS candidate_phone,
        j.title AS job_title,
        j.company AS job_company,
        j.location AS job_location,
        '[]'::json AS interview_round_history
      FROM applications a
      JOIN candidates c ON c.id = a.candidate_id
      JOIN jobs j ON j.id = a.job_id
      ${whereClause}
      `,
    params,
    "compatibility applications query"
  );
  if (compatibility) return compatibility;

  const legacy = await query(
    `
    SELECT
      a.id,
      a.candidate_id,
      a.job_id,
      COALESCE(NULLIF(a.status, ''), 'Applied') AS stage,
      a.updated_at,
      FALSE AS interview_scheduled,
      NULL::timestamptz AS interview_datetime,
      NULL::text AS interview_reschedule_reason,
      NULL::text AS interview_cancel_reason,
      FALSE AS interview_no_show,
      NULL::text AS interview_substatus,
      NULL::timestamptz AS interview_completed_at,
      NULL::text AS interview_status_note,
      NULL::bigint AS current_interview_round_id,
      NULL::int AS current_interview_round_order,
      NULL::text AS interview_round_status,
      NULL::int AS rejected_in_round_order,
      NULL::int AS selected_after_rounds,
      NULL::text AS final_outcome,
      COALESCE(a.source, 'UI') AS application_source,
      NULL::bigint AS assigned_recruiter_user_id,
      NULL::text AS assigned_recruiter_name,
      NULL::text AS current_interview_round_label,
      0::int AS interview_round_total,
      c.full_name AS candidate_full_name,
      c.email AS candidate_email,
      c.phone AS candidate_phone,
      j.title AS job_title,
      j.company AS job_company,
      j.location AS job_location,
      '[]'::json AS interview_round_history
    FROM applications a
    JOIN candidates c ON c.id = a.candidate_id
    JOIN jobs j ON j.id = a.job_id
    ${whereClause.replaceAll("a.stage", "COALESCE(NULLIF(a.status, ''), 'Applied')")}
    `,
    params
  );

  return legacy;
}

export async function fetchApplicationsRows({
  whereClause,
  params,
}: {
  whereClause: string;
  params: unknown[];
}) {
  return await fetchApplicationRowsInternal(whereClause, params);
}

/** Single pipeline card row (matches GET /api/applications list item shape). */
export async function fetchApplicationCardRow(applicationId: number, userId: number) {
  const hasTeam = await hasJobTeamTable();
  const vis = applicationAccessPredicate("a", "$2", hasTeam);
  const result = await fetchApplicationRowsInternal(`WHERE a.id = $1 AND ${vis}`, [applicationId, userId]);
  return (result.rows[0] as QueryResultRow) ?? null;
}
