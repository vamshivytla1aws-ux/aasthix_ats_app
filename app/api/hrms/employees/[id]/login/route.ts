import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requirePermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { writeAuditLog } from "@/lib/auditLog";
import { passwordFromJoiningDate } from "@/lib/hrms/joiningDatePassword";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function employeeAccount(id: string) {
  const employeeId = Number(id);
  if (!Number.isInteger(employeeId) || employeeId <= 0) return null;
  const result = await query(`SELECT id, email, role, COALESCE(is_active, true) AS is_active,
    employment_status, to_char(joining_date, 'YYYY-MM-DD') AS joining_date, password_hash IS NOT NULL AS login_ready FROM users WHERE id = $1`, [employeeId]);
  return result.rows[0] as { id: number; email: string; role: string; is_active: boolean; employment_status: string; login_ready: boolean; joining_date: string | null } | undefined;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("employee_directory.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.access.role === "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const employee = await employeeAccount(params.id);
  if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  if (employee.role !== "employee") return NextResponse.json({ error: "This account uses staff sign in. Employee HRMS sign in requires the employee role." }, { status: 409 });
  return NextResponse.json({ email: employee.email, loginReady: employee.login_ready, joiningDate: employee.joining_date || null,
    active: employee.is_active && !["inactive", "resigned"].includes(employee.employment_status), loginPath: "/employee/login" });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("employee_directory.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.access.role === "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const employee = await employeeAccount(params.id);
  if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
  if (employee.role !== "employee") return NextResponse.json({ error: "Only employee accounts can be configured here." }, { status: 403 });
  if (!employee.is_active || ["inactive", "resigned"].includes(employee.employment_status)) return NextResponse.json({ error: "Activate the employee record before setting up login." }, { status: 409 });
  const body = await request.json().catch(() => null) as { joiningDate?: unknown } | null;
  const joiningDate = body?.joiningDate ?? employee.joining_date;
  let password: string;
  try { password = passwordFromJoiningDate(joiningDate); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Enter a valid date of joining." }, { status: 400 }); }
  const hash = await bcrypt.hash(password, 12);
  const result = await query(`UPDATE users SET password_hash = $1, joining_date = $3::date, token_version = COALESCE(token_version, 1) + 1, updated_at = NOW()
    WHERE id = $2 AND role = 'employee' AND COALESCE(is_active, true) = true AND COALESCE(employment_status, 'active') = 'active' RETURNING id`, [hash, employee.id, joiningDate]);
  if (!result.rows.length) return NextResponse.json({ error: "Employee access changed. Reload the record." }, { status: 409 });
  await writeAuditLog({ actorUserId: auth.access.user_id, action: "hrms.employee.login_configured", metadata: { employee_id: employee.id } });
  return NextResponse.json({ ok: true, user_message: "Employee login password saved.", loginPath: "/employee/login" });
}
