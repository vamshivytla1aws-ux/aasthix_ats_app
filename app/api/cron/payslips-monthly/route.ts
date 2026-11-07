import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { calculateSalaryStructure } from "@/lib/salary/engine";
import { amountToRupeesWords } from "@/lib/salary/numberToWords";
import { applyPayslipProration, getSalaryStructureForMonth, toCalcInputFromStructure } from "@/lib/salary/service";
import { buildPayslipPdf } from "@/lib/pdf/payslipExport";
import { loadActiveTaxConfig, calculateAnnualTaxFromConfig } from "@/lib/salary/tax";
import type { PayslipTaxSheetSnapshot } from "@/lib/salary/types";
import { getMonthDays } from "@/lib/salary/monthDays";
import { getPayrollRunByMonthYear } from "@/lib/hrms/payroll";
import { loadEmployeeSnapshot } from "@/lib/salary/employeeSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fyAprilIndex(month: number) {
  return month >= 4 ? month - 4 : month + 8;
}

async function buildTaxSheetSnapshot(
  grossMonthly: number,
  deductions: Array<{ name: string; amountForMonth?: number }>,
  regime: "new_regime" | "old_regime" | "manual_tds",
  month: number,
  monthLabel: string,
): Promise<PayslipTaxSheetSnapshot> {
  const monthIndex = fyAprilIndex(month);
  const annualTotalIncome = Math.round(grossMonthly * 12 * 100) / 100;
  let standardDeduction = 0;
  let grossTaxableIncome = 0;
  let incomeTaxPayable = 0;
  let cess = 0;
  let totalIncomeTaxPayable = 0;
  let rebate = 0;
  if (regime === "manual_tds") {
    const monthlyTds = Number(deductions.find((d) => d.name.toLowerCase().includes("tds"))?.amountForMonth || 0);
    incomeTaxPayable = Math.round(monthlyTds * 12 * 100) / 100;
    totalIncomeTaxPayable = incomeTaxPayable;
    grossTaxableIncome = annualTotalIncome;
  } else {
    const cfg = await loadActiveTaxConfig(regime);
    standardDeduction = Number(cfg.standardDeduction || 0);
    const computed = calculateAnnualTaxFromConfig(annualTotalIncome, cfg);
    grossTaxableIncome = Math.round(computed.taxableIncome * 100) / 100;
    incomeTaxPayable = Math.round(computed.annualTaxBeforeCess * 100) / 100;
    totalIncomeTaxPayable = Math.round(computed.annualTax * 100) / 100;
    cess = Math.round((totalIncomeTaxPayable - incomeTaxPayable) * 100) / 100;
    if (computed.taxableIncome <= Number(cfg.rebateThreshold || 0)) rebate = incomeTaxPayable;
  }
  const monthlyTaxDeduction = new Array(12).fill(0) as number[];
  monthlyTaxDeduction[monthIndex] = Math.round((totalIncomeTaxPayable / 12) * 100) / 100;
  return {
    titleMonthLabel: monthLabel,
    totalIncomeActualYtd: Math.round(grossMonthly * (monthIndex + 1) * 100) / 100,
    projectedIncomeTillMarch: annualTotalIncome,
    annualTotalIncome,
    additionalIncome: 0,
    totalGrossIncome: annualTotalIncome,
    actualHraReceived: 0,
    grossSalaryBeforeStdDeduction: annualTotalIncome,
    standardDeduction,
    grossSalaryAfterStdDeduction: Math.max(0, annualTotalIncome - standardDeduction),
    totalIncomeFromSalary: Math.max(0, annualTotalIncome - standardDeduction),
    grossTaxableIncome,
    rebate,
    totalInvestments: 0,
    netTaxableIncomeRoundedOff: Math.round(grossTaxableIncome),
    incomeTaxPayable,
    cess,
    totalIncomeTaxPayable,
    balanceTax: totalIncomeTaxPayable,
    monthlyTaxDeduction,
  };
}

function toDateOnly(value: unknown): string {
  if (!value) return "-";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function POST(request: Request) {
  const authz = request.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET || "";
  if (!expected || authz !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { month?: number; year?: number };
  const now = new Date();
  const month = Number(body.month || now.getMonth() + 1);
  const year = Number(body.year || now.getFullYear());
  if (!(month >= 1 && month <= 12) || !Number.isFinite(year)) {
    return NextResponse.json({ error: "Invalid month/year" }, { status: 400 });
  }
  const payroll = await getPayrollRunByMonthYear(month, year);
  if (payroll?.status === "locked") return NextResponse.json({ error: "Payroll month is locked." }, { status: 409 });

  const employeesRes = await query(
    `
      SELECT DISTINCT s.employee_id
      FROM salary_structures s
      JOIN users u ON u.id = s.employee_id
      WHERE COALESCE(u.employment_status, 'active') = 'active'
    `,
    [],
  );
  let generated = 0;
  let manualReviewRequired = 0;
  const failed: Array<{ employeeId: number; error: string }> = [];

  for (const row of employeesRes.rows as Array<{ employee_id: number }>) {
    const employeeId = Number(row.employee_id || 0);
    if (!employeeId) continue;
    try {
      // Scheduled generation must not replace a reviewed or manually generated payslip.
      const existing = await query(`SELECT id FROM payslips WHERE employee_id = $1 AND month = $2 AND year = $3`, [employeeId, month, year]);
      if (existing.rows.length) continue;
      const latest = await getSalaryStructureForMonth(employeeId, month, year);
      if (!latest) continue;
      const input = toCalcInputFromStructure(latest.structure);
      const paidDaysResolved = getMonthDays(year, month);
      input.salaryMonth = `${year}-${String(month).padStart(2, "0")}-01`;
      input.definedWorkDays = paidDaysResolved;
      input.totalPaidDays = paidDaysResolved;
      input.lopDays = 0;
      // Partial-month attendance needs explicit review in the simple generator.
      if (input.agreedBreakup || input.packageReview) { manualReviewRequired += 1; continue; }
      const employeeSnapshot = await loadEmployeeSnapshot(employeeId, latest.structure);
      const calc = await calculateSalaryStructure(input);
      const prorated = applyPayslipProration(calc, paidDaysResolved, 0);
      const totalDeductions = Math.round(prorated.totalDeductions * 100) / 100;
      const netSalary = Math.round((prorated.grossMonthly - totalDeductions) * 100) / 100;
      const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", {
        month: "long",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      });
      const taxSheetSnapshot = await buildTaxSheetSnapshot(prorated.grossMonthly, prorated.deductions, input.taxRegime, month, monthLabel);
      const pdfBytes = await buildPayslipPdf({
        companyName: "AASTHIX TALENT",
        monthLabel,
        employeeName: employeeSnapshot.employeeName,
        employeeCode: employeeSnapshot.employeeCode || "-",
        department: employeeSnapshot.department || "-",
        designation: employeeSnapshot.designation || "-",
        dateOfJoining: employeeSnapshot.dateOfJoining || "-",
        pan: employeeSnapshot.pan || "-",
        uanNumber: employeeSnapshot.uanNumber || "-",
        pfNumber: employeeSnapshot.pfNumber || "-",
        bankAccountNumber: employeeSnapshot.bankAccountNumber || "-",
        workLocation: employeeSnapshot.workLocation || "-",
        paidDays: paidDaysResolved,
        lopDays: 0,
        earnings: prorated.earnings,
        deductions: prorated.deductions,
        grossSalary: prorated.grossMonthly,
        totalDeductions,
        netSalary,
        netSalaryInWords: amountToRupeesWords(Math.round(netSalary)),
        taxSheetSnapshot,
      });

      const upsert = await query(
        `
          INSERT INTO payslips
          (employee_id, salary_structure_id, month, year, paid_days, lop_days, gross_monthly, total_deductions, net_salary, net_salary_words, tax_sheet_snapshot, pdf_blob, generated_at, created_by_user_id, created_at, employee_snapshot)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NULL,NOW(),$13::jsonb)
          ON CONFLICT (employee_id, year, month)
          DO NOTHING
          RETURNING id
        `,
        [
          employeeId,
          Number(latest.structure.id),
          month,
          year,
          paidDaysResolved,
          0,
          prorated.grossMonthly,
          totalDeductions,
          netSalary,
          amountToRupeesWords(Math.round(netSalary)),
          JSON.stringify(taxSheetSnapshot),
          pdfBytes,
          JSON.stringify(employeeSnapshot),
        ],
      );
      const payslipId = Number(upsert.rows[0]?.id || 0);
      if (!payslipId) continue;
      await query(`DELETE FROM payslip_line_items WHERE payslip_id = $1`, [payslipId]);
      for (const item of [...prorated.earnings, ...prorated.deductions]) {
        await query(
          `INSERT INTO payslip_line_items (payslip_id, item_class, name, annual_amount, monthly_amount, amount_for_month, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [payslipId, item.type, item.name, item.annual, item.monthly, item.amountForMonth || 0, item.sortOrder],
        );
      }
      generated += 1;
    } catch (error) {
      failed.push({ employeeId, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  return NextResponse.json({
    operation_status: failed.length === 0 ? "success" : generated > 0 ? "partial" : "error",
    user_message: `Generated payslips for ${generated} employee(s).`,
    generated,
    manualReviewRequired,
    failed,
    month,
    year,
  });
}
