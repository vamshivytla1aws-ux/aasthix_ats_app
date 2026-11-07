import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { calculateSalaryStructure } from "@/lib/salary/engine";
import type { PackageReview, SalaryCalcInput } from "@/lib/salary/types";
import { estimatePackage, roundMoney, salaryMonthPattern } from "@/lib/salary/packageReview";
import { calculateAnnualTaxFromConfig, loadVerifiedTaxConfig } from "@/lib/salary/tax";
import { canAccessSalaryEmployee } from "@/lib/salary/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidPan(pan: string) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
}

export async function POST(request: Request) {
  const auth = await requirePermission("salary.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.access.role === "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as (SalaryCalcInput & { packageEstimate?: boolean }) | null;
  if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  if (body.pan && !isValidPan(String(body.pan).toUpperCase())) {
    return NextResponse.json({ error: "Invalid PAN format" }, { status: 400 });
  }
  if (body.uanNumber && !/^[0-9]{1,20}$/.test(String(body.uanNumber))) {
    return NextResponse.json({ error: "UAN must be numeric" }, { status: 400 });
  }
  try {
    if (!await canAccessSalaryEmployee(auth.access, Number(body.employeeId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (body.packageEstimate) {
      const month = String(body.salaryMonth || "");
      if (!salaryMonthPattern.test(month)) throw new Error("Select a valid effective month.");
      const draft: Partial<PackageReview> = body.packageReview ?? { regime: body.taxRegime };
      const estimate = estimatePackage(body.ctcAnnual, draft);
      const start = Number(month.slice(0, 4)) - (Number(month.slice(5)) < 4 ? 1 : 0);
      const financialYear = `FY ${start}-${String(start + 1).slice(-2)}`;
      const config = draft.regime && draft.tds == null && estimate.cashGross != null
        ? await loadVerifiedTaxConfig(draft.regime, financialYear) : null;
      const suggestedTds = config && estimate.cashGross != null
        ? roundMoney(calculateAnnualTaxFromConfig(estimate.cashGross * 12, config).annualTax / 12) : null;
      return NextResponse.json({ estimate, financialYear, suggestedTds });
    }
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
