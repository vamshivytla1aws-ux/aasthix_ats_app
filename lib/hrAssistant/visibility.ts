import { query } from "@/lib/db";
import type { AuthAccess } from "@/lib/rbac";

let jobTeamCache: boolean | null = null;

export async function hasJobTeamTable(): Promise<boolean> {
  if (jobTeamCache !== null) return jobTeamCache;
  try {
    await query(`SELECT 1 FROM job_team LIMIT 0`, []);
    jobTeamCache = true;
  } catch {
    jobTeamCache = false;
  }
  return jobTeamCache;
}

export function isAdmin(access: AuthAccess) {
  return access.role === "admin";
}

export async function applicationsScopeSql(access: AuthAccess, params: unknown[]) {
  if (isAdmin(access)) return "TRUE";
  const uid = access.user_id;
  if (await hasJobTeamTable()) {
    params.push(uid);
    const i = params.length;
    return `(a.created_by_user_id = $${i} OR EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = a.job_id AND jt.user_id = $${i}))`;
  }
  params.push(uid);
  const i = params.length;
  return `a.created_by_user_id = $${i}`;
}

export function candidatesScopeSql(access: AuthAccess, params: unknown[], alias = "c") {
  if (isAdmin(access)) return "TRUE";
  params.push(access.user_id);
  const i = params.length;
  return `${alias}.created_by_user_id = $${i}`;
}

export async function jobsScopeSql(access: AuthAccess, params: unknown[], alias = "j") {
  if (isAdmin(access)) return "TRUE";
  const uid = access.user_id;
  if (await hasJobTeamTable()) {
    params.push(uid);
    const i = params.length;
    return `(${alias}.created_by_user_id = $${i} OR EXISTS (SELECT 1 FROM job_team jt WHERE jt.job_id = ${alias}.id AND jt.user_id = $${i}))`;
  }
  params.push(uid);
  const i = params.length;
  return `${alias}.created_by_user_id = $${i}`;
}
