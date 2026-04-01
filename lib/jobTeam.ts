/**
 * Job team membership helpers.
 *
 * The `job_team` table assigns users to specific roles on a requisition
 * (hiring_manager, recruiter, coordinator, sourcer, observer).  Team
 * membership extends visibility: non-owner team members can see the job
 * and its applications even though `created_by_user_id != user_id`.
 */

import { query } from "@/lib/db";

export const JOB_TEAM_ROLES = [
  "hiring_manager",
  "recruiter",
  "coordinator",
  "sourcer",
  "observer",
] as const;

export type JobTeamRole = (typeof JOB_TEAM_ROLES)[number];

export function isJobTeamRole(v: unknown): v is JobTeamRole {
  return typeof v === "string" && (JOB_TEAM_ROLES as readonly string[]).includes(v);
}

export type JobTeamRow = {
  id: number;
  job_id: number;
  user_id: number;
  role: JobTeamRole;
  created_at: string;
  user_email?: string;
  user_name?: string;
};

/**
 * SQL fragment returning job IDs visible to a user through team membership.
 * Use as a sub-select:  `... WHERE j.id IN (${teamJobIdsSql(paramIndex)})`
 *
 * The caller must supply `user_id` at position `$paramIndex`.
 */
export function teamJobIdsSql(paramIndex: number): string {
  return `SELECT jt.job_id FROM job_team jt WHERE jt.user_id = $${paramIndex}`;
}

/**
 * Returns all job IDs a user can see: owned + team membership.
 * Gracefully returns owned-only if the `job_team` table doesn't exist.
 */
export async function visibleJobIds(userId: number): Promise<number[]> {
  try {
    const res = await query(
      `
      SELECT DISTINCT id FROM (
        SELECT j.id FROM jobs j WHERE j.created_by_user_id = $1
        UNION
        SELECT jt.job_id AS id FROM job_team jt WHERE jt.user_id = $1
      ) combined
      `,
      [userId]
    );
    return res.rows.map((r: { id: number }) => r.id);
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "42P01") {
      const res = await query(`SELECT id FROM jobs WHERE created_by_user_id = $1`, [userId]);
      return res.rows.map((r: { id: number }) => r.id);
    }
    throw e;
  }
}
