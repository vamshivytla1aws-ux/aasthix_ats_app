import { query } from "@/lib/db";
import { applicationAccessPredicate, hasJobTeamTable } from "@/lib/applicationVisibility";

/** Single pipeline card row (matches GET /api/applications list item shape). */
export async function fetchApplicationCardRow(applicationId: number, userId: number) {
  const hasTeam = await hasJobTeamTable();
  const vis = applicationAccessPredicate("a", "$2", hasTeam);

  const result = await query(
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
      j.location AS job_location
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
    WHERE a.id = $1 AND ${vis}
    `,
    [applicationId, userId]
  );

  return (result.rows[0] as Record<string, unknown>) ?? null;
}
