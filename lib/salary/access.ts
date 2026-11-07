import { query } from "@/lib/db";
import type { AuthAccess } from "@/lib/rbac";

export function isReportingManager(access: AuthAccess) {
  return access.role === "manager" || access.role === "hiring_manager";
}

export async function canAccessSalaryEmployee(access: AuthAccess, employeeId: number) {
  if (access.role === "employee") return access.user_id === employeeId;
  if (!isReportingManager(access)) return true;
  const team = await query("SELECT 1 FROM users WHERE id = $1 AND reporting_manager_user_id = $2", [employeeId, access.user_id]);
  return team.rowCount > 0;
}
