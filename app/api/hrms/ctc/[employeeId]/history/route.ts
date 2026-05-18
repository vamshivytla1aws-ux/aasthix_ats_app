import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { listEmployeeCtcHistory } from "@/lib/salary/service";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function canAccessEmployee(access: NonNullable<Awaited<ReturnType<typeof getAuthAccess>>>, employeeId: number) {
  if (access.role === "admin" || access.permissions["salary.manage"] || access.permissions["employee_directory.view_all"]) return true;
  if (access.role === "employee" && employeeId === access.user_id) return true;
  if (access.role === "hiring_manager" || access.role === "manager" || access.permissions["employee_directory.view_team"]) {
    const res = await query(`SELECT 1 FROM users WHERE id = $1 AND reporting_manager_user_id = $2 LIMIT 1`, [employeeId, access.user_id]);
    return res.rowCount > 0;
  }
  return false;
}

export async function GET(_request: Request, { params }: { params: { employeeId: string } }) {
  const auth = await requirePermission("salary.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const employeeId = Number(params.employeeId);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return NextResponse.json({ operation_status: "blocked", user_message: "Invalid employee id." }, { status: 400 });
  }
  const allowed = await canAccessEmployee(auth.access, employeeId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const history = await listEmployeeCtcHistory(employeeId);
  return NextResponse.json({ operation_status: "success", history });
}

