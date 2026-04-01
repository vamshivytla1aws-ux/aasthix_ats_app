import { query } from "@/lib/db";

export async function hasJobTeamTable(): Promise<boolean> {
  try {
    await query(`SELECT 1 FROM job_team LIMIT 0`, []);
    return true;
  } catch {
    return false;
  }
}

/** SQL predicate: current user may access this application (creator or job team). */
export function applicationAccessPredicate(alias: string, userParam: string, hasTeam: boolean): string {
  if (!hasTeam) return `${alias}.created_by_user_id = ${userParam}`;
  return `(${alias}.created_by_user_id = ${userParam} OR EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = ${alias}.job_id AND jt.user_id = ${userParam}))`;
}
