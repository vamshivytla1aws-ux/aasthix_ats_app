import { query } from "@/lib/db";

export async function hasJobTeamTable(): Promise<boolean> {
  try {
    await query(`SELECT 1 FROM job_team LIMIT 0`, []);
    return true;
  } catch {
    return false;
  }
}

/**
 * Single-tenant ATS visibility:
 * once a user has the relevant pipeline permission, row-level application access
 * should not be restricted by creator or job team membership.
 *
 * We keep the helper signature intact so existing callers do not need to change.
 */
export function applicationAccessPredicate(alias: string, userParam: string, hasTeam: boolean): string {
  void alias;
  void userParam;
  void hasTeam;
  return "TRUE";
}
