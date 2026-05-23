import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { calculateSalaryStructure } from "@/lib/salary/engine";
import type { SalaryCalcInput } from "@/lib/salary/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidPan(pan: string) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
}

export async function POST(request: Request) {
  const auth = await requirePermission("salary.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as SalaryCalcInput | null;
  if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  if (body.pan && !isValidPan(String(body.pan).toUpperCase())) {
    return NextResponse.json({ error: "Invalid PAN format" }, { status: 400 });
  }
  if (body.uanNumber && !/^[0-9]{1,20}$/.test(String(body.uanNumber))) {
    return NextResponse.json({ error: "UAN must be numeric" }, { status: 400 });
  }
  try {
    const result = await calculateSalaryStructure({
      ...body,
      taxRegime: body.taxRegime || "new_regime",
      employeeCode: String(body.employeeCode || ""),
      salaryMonth: String(body.salaryMonth || new Date().toISOString().slice(0, 10)),
      definedWorkDays: Number(body.definedWorkDays || body.totalPaidDays || 0),
      totalPaidDays: Number(body.totalPaidDays || 0),
      lopDays: Number(body.lopDays || 0),
      pfEnabled: Boolean(body.pfEnabled),
      employerPfIncludedInCtc: Boolean(body.employerPfIncludedInCtc),
      employeePfEnabled: Boolean(body.employeePfEnabled),
      healthInsuranceEnabled: Boolean(body.healthInsuranceEnabled),
    });
    return NextResponse.json({ calculation: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to calculate salary structure" },
      { status: 400 }
    );
  }
}
