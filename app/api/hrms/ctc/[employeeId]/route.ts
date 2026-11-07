import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { getEmployeeCtcByMonth, updateCtcVersion } from "@/lib/salary/service";
import { getPayrollRunByMonthYear } from "@/lib/hrms/payroll";
import { writeAuditLog } from "@/lib/auditLog";
import { query } from "@/lib/db";
import { canAccessSalaryEmployee } from "@/lib/salary/access";
import { employeeSalaryOverview } from "@/lib/salary/overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const allowed = await canAccessSalaryEmployee(auth.access, employeeId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const period = parseMonthYear(new URL(request.url));
  if (!period) {
    return NextResponse.json({ operation_status: "blocked", user_message: "Valid month and year are required." }, { status: 400 });
  }
  const data = await getEmployeeCtcByMonth(employeeId, period.month, period.year);
  if (!data) return NextResponse.json({ operation_status: "blocked", user_message: "No CTC found for selected period." }, { status: 404 });
  return NextResponse.json({ operation_status: "success", data: auth.access.role === "employee" ? employeeSalaryOverview(data) : data });
}

export async function PATCH(request: Request, { params }: { params: { employeeId: string } }) {
  try {
    const auth = await requirePermission("salary.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.access.role === "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const versionId = Number(params.employeeId);
    if (!Number.isFinite(versionId) || versionId <= 0) {
      return NextResponse.json({ operation_status: "blocked", user_message: "Invalid CTC version id." }, { status: 400 });
    }
    const body = (await request.json().catch(() => null)) as { ctcAnnual?: number; effectiveFrom?: string | null } | null;
    if (!body || !Number.isFinite(Number(body.ctcAnnual)) || Number(body.ctcAnnual) <= 0) {
      return NextResponse.json({ operation_status: "blocked", user_message: "Valid CTC annual amount is required." }, { status: 400 });
    }
    const existing = (await query("SELECT employee_id, effective_from::text, agreed_breakup, package_review FROM salary_structures WHERE id = $1", [versionId])).rows[0];
    if (!existing) return NextResponse.json({ error: "CTC version not found." }, { status: 404 });
    if (!await canAccessSalaryEmployee(auth.access, Number(existing.employee_id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (existing.agreed_breakup || existing.package_review) {
      return NextResponse.json({ error: "Edit the agreed or reviewed breakup in the employee’s Salary & Payslips tab." }, { status: 409 });
    }
    const effectiveFrom = body.effectiveFrom ? String(body.effectiveFrom) : null;
    const targetDate = effectiveFrom || existing.effective_from;
    const dt = new Date(targetDate);
    if (Number.isNaN(dt.getTime())) {
      return NextResponse.json({ operation_status: "blocked", user_message: "Invalid effective month." }, { status: 400 });
    }

    const originalDate = new Date(existing.effective_from);
    const run = await getPayrollRunByMonthYear(dt.getUTCMonth() + 1, dt.getUTCFullYear());
    const originalRun = targetDate === existing.effective_from ? run : await getPayrollRunByMonthYear(originalDate.getUTCMonth() + 1, originalDate.getUTCFullYear());
    if (run?.status === "locked" || originalRun?.status === "locked") {
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

