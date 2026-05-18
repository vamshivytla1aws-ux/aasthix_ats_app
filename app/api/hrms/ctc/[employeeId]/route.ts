import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { getEmployeeCtcByMonth, updateCtcVersion } from "@/lib/salary/service";
import { getPayrollRunByMonthYear } from "@/lib/hrms/payroll";
import { writeAuditLog } from "@/lib/auditLog";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function canAccessEmployee(access: NonNullable<Awaited<ReturnType<typeof getAuthAccess>>>, employeeId: number) {
  if (access.role === "admin" || access.permissions["salary.manage"] || access.permissions["employee_directory.view_all"]) return true;
  if (access.role === "employee" || access.permissions["salary.view"]) {
    if (employeeId === access.user_id) return true;
  }
  if (access.role === "hiring_manager" || access.role === "manager" || access.permissions["employee_directory.view_team"]) {
    const res = await query(`SELECT 1 FROM users WHERE id = $1 AND reporting_manager_user_id = $2 LIMIT 1`, [employeeId, access.user_id]);
    return res.rowCount > 0;
  }
  return false;
}

function parseMonthYear(url: URL) {
  const month = Number(url.searchParams.get("month") || 0);
  const year = Number(url.searchParams.get("year") || 0);
  if (!(month >= 1 && month <= 12) || !(year >= 2000)) return null;
  return { month, year };
}

export async function GET(request: Request, { params }: { params: { employeeId: string } }) {
  const auth = await requirePermission("salary.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const employeeId = Number(params.employeeId);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return NextResponse.json({ operation_status: "blocked", user_message: "Invalid employee id." }, { status: 400 });
  }
  const allowed = await canAccessEmployee(auth.access, employeeId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const period = parseMonthYear(new URL(request.url));
  if (!period) {
    return NextResponse.json({ operation_status: "blocked", user_message: "Valid month and year are required." }, { status: 400 });
  }
  const data = await getEmployeeCtcByMonth(employeeId, period.month, period.year);
  if (!data) return NextResponse.json({ operation_status: "blocked", user_message: "No CTC found for selected period." }, { status: 404 });
  return NextResponse.json({ operation_status: "success", data });
}

export async function PATCH(request: Request, { params }: { params: { employeeId: string } }) {
  try {
    const auth = await requirePermission("salary.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const versionId = Number(params.employeeId);
    if (!Number.isFinite(versionId) || versionId <= 0) {
      return NextResponse.json({ operation_status: "blocked", user_message: "Invalid CTC version id." }, { status: 400 });
    }
    const body = (await request.json().catch(() => null)) as { ctcAnnual?: number; effectiveFrom?: string | null } | null;
    if (!body || !Number.isFinite(Number(body.ctcAnnual)) || Number(body.ctcAnnual) <= 0) {
      return NextResponse.json({ operation_status: "blocked", user_message: "Valid CTC annual amount is required." }, { status: 400 });
    }
    const effectiveFrom = body.effectiveFrom ? String(body.effectiveFrom) : null;
    const targetDate = effectiveFrom || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
    const dt = new Date(targetDate);
    if (Number.isNaN(dt.getTime())) {
      return NextResponse.json({ operation_status: "blocked", user_message: "Invalid effective month." }, { status: 400 });
    }

    const run = await getPayrollRunByMonthYear(dt.getMonth() + 1, dt.getFullYear());
    if (run?.status === "locked") {
      await writeAuditLog({
        actorUserId: auth.access.user_id,
        action: "hrms.ctc.update_blocked_locked_month",
        metadata: { salary_structure_id: versionId, month: dt.getMonth() + 1, year: dt.getFullYear() },
      });
      return NextResponse.json(
        {
          operation_status: "blocked",
          user_message: "Payroll month is locked. CTC edit is blocked.",
          hint: "Unlock payroll month from Payroll Control to edit this period.",
        },
        { status: 409 },
      );
    }

    await updateCtcVersion(versionId, { ctcAnnual: Number(body.ctcAnnual), effectiveFrom }, auth.access.user_id);
    return NextResponse.json({ operation_status: "success", user_message: "CTC version updated." });
  } catch (error) {
    return NextResponse.json(
      {
        operation_status: "error",
        user_message: error instanceof Error ? error.message : "Failed to update CTC version.",
      },
      { status: 500 },
    );
  }
}

