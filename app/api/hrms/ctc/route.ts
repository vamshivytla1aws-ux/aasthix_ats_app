import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { createCtcVersion } from "@/lib/salary/service";
import type { SalaryCalcInput } from "@/lib/salary/types";
import { getPayrollRunByMonthYear } from "@/lib/hrms/payroll";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toMonthYear(ymd: string) {
  const dt = new Date(ymd);
  if (Number.isNaN(dt.getTime())) return null;
  return { month: dt.getMonth() + 1, year: dt.getFullYear() };
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("salary.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = (await request.json().catch(() => null)) as SalaryCalcInput | null;
    if (!body) return NextResponse.json({ operation_status: "blocked", user_message: "Invalid payload." }, { status: 400 });
    if (!Number.isFinite(Number(body.employeeId)) || Number(body.employeeId) <= 0) {
      return NextResponse.json({ operation_status: "blocked", user_message: "Valid employee is required." }, { status: 400 });
    }
    if (!body.salaryMonth) {
      return NextResponse.json({ operation_status: "blocked", user_message: "Effective salary month is required." }, { status: 400 });
    }

    const period = toMonthYear(String(body.salaryMonth));
    if (!period) return NextResponse.json({ operation_status: "blocked", user_message: "Invalid salary month." }, { status: 400 });
    const run = await getPayrollRunByMonthYear(period.month, period.year);
    if (run?.status === "locked") {
      await writeAuditLog({
        actorUserId: auth.access.user_id,
        action: "hrms.ctc.create_blocked_locked_month",
        metadata: { month: period.month, year: period.year, employee_id: Number(body.employeeId) },
      });
      return NextResponse.json(
        {
          operation_status: "blocked",
          user_message: "Payroll month is locked. CTC changes are blocked.",
          hint: "Unlock payroll month from Payroll Control to edit this period.",
        },
        { status: 409 },
      );
    }

    const result = await createCtcVersion(body, auth.access.user_id);
    return NextResponse.json({
      operation_status: "success",
      user_message: "CTC version saved.",
      salaryStructureId: result.salaryStructureId,
      calculation: result.calc,
    });
  } catch (error) {
    return NextResponse.json(
      {
        operation_status: "error",
        user_message: error instanceof Error ? error.message : "Failed to save CTC version.",
      },
      { status: 500 },
    );
  }
}

