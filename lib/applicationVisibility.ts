import { query } from "@/lib/db";

export async function hasJobTeamTable(): Promise<boolean> {
  try {
    await query(`SELECT 1 FROM job_team LIMIT 0`, []);
    return true;
  } catch {
    return false;
  }
}

export function applicationAccessPredicate(alias: string, userParam: string, hasTeam: boolean): string {
  const teamClause = hasTeam
    ? `OR EXISTS (SELECT 1 FROM job_team scope_jt WHERE scope_jt.job_id = ${alias}.job_id AND scope_jt.user_id = ${userParam}::bigint)`
    : "";
  return `(
    ${userParam}::bigint IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM users scope_user
      WHERE scope_user.id = ${userParam}::bigint
        AND (
          lower(scope_user.role) IN ('workspace_owner', 'owner')
          OR COALESCE(scope_user.access_scope, 'own') = 'all'
          OR ${alias}.created_by_user_id = ${userParam}::bigint
          OR ${alias}.assigned_recruiter_user_id = ${userParam}::bigint
          ${teamClause}
        )
    )
  )`;
}
