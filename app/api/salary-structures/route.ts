import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { createSalaryStructure, getSalaryStructureForMonth, listSalaryEmployees } from "@/lib/salary/service";
import type { SalaryCalcInput } from "@/lib/salary/types";
import { canAccessSalaryEmployee, isReportingManager } from "@/lib/salary/access";
import { getPayrollRunByMonthYear } from "@/lib/hrms/payroll";
import { estimatePackage, salaryMonthPattern } from "@/lib/salary/packageReview";
import { getMonthDays } from "@/lib/salary/monthDays";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidPan(pan: string) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);
}

export async function GET() {
  const auth = await requirePermission("salary.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const employees = await listSalaryEmployees(auth.access.role === "employee" ? auth.access.user_id : undefined,
    isReportingManager(auth.access) ? auth.access.user_id : undefined);
  return NextResponse.json({ employees });
}

export async function POST(request: Request) {
  const auth = await requirePermission("salary.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.access.role === "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as (SalaryCalcInput & { confirmPackage?: boolean }) | null;
  if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  if (body.pan && !isValidPan(String(body.pan).toUpperCase())) {
    return NextResponse.json({ error: "Invalid PAN format" }, { status: 400 });
  }
  if (body.uanNumber && !/^[0-9]{1,20}$/.test(String(body.uanNumber))) {
    return NextResponse.json({ error: "UAN must be numeric" }, { status: 400 });
  }
  try {
    const employeeId = Number(body.employeeId);
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0) throw new Error("Select an employee.");
    if (!await canAccessSalaryEmployee(auth.access, employeeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const date = String(body.salaryMonth || "");
    const period = date.slice(0, 7);
    if (!salaryMonthPattern.test(period) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Select a valid effective month.");
    const [year, month] = period.split("-").map(Number);
    if ((await getPayrollRunByMonthYear(month, year))?.status === "locked") {
      return NextResponse.json({ error: "Payroll month is locked. Salary setup cannot be changed." }, { status: 409 });
    }
    if (body.packageReview) {
      if (body.confirmPackage !== true || date !== `${period}-01`) throw new Error("Confirm the reviewed package and its effective month.");
      const { employerPfInCtc, employerPf, employeePf, professionalTax, tds, regime } = body.packageReview;
      body.packageReview = { employerPfInCtc, employerPf, employeePf, professionalTax, tds, regime };
      if (estimatePackage(body.ctcAnnual, body.packageReview).net == null) throw new Error("Confirm all payroll amounts, including any zero deductions.");
      const prior = (await getSalaryStructureForMonth(employeeId, month, year))?.structure;
      if (body.pan === undefined) body.pan = prior?.pan ?? null;
      if (body.uanNumber === undefined) body.uanNumber = prior?.uan_number ?? null;
      if (body.pfNumber === undefined) body.pfNumber = prior?.pf_number ?? null;
      if (body.bankAccountNumber === undefined) body.bankAccountNumber = prior?.bank_account_number ?? null;
      body.definedWorkDays = body.totalPaidDays = getMonthDays(year, month);
      body.lopDays = 0;
      body.taxRegime = "manual_tds";
      body.manualTdsAnnual = tds * 12;
      body.professionalTaxMonthly = professionalTax;
      body.pfEnabled = employerPf > 0 || employeePf > 0;
      body.employeePfEnabled = employeePf > 0;
      body.employerPfIncludedInCtc = employerPfInCtc;
      body.healthInsuranceEnabled = false;
      body.healthInsuranceAnnual = 0;
    }
    const saved = await createSalaryStructure(
      {
        ...body,
        employeeId,
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
      },
      auth.access.user_id
    );
    return NextResponse.json({
      ok: true,
      salary_structure_id: saved.salaryStructureId,
      calculation: saved.calc,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save salary structure" },
      { status: 400 }
    );
  }
}
