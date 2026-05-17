import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import { buildPayslipPdf } from "@/lib/pdf/payslipExport";
import { amountToRupeesWords } from "@/lib/salary/numberToWords";
import type { PayslipTaxSheetSnapshot } from "@/lib/salary/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fyAprilIndex(month: number) {
  return month >= 4 ? month - 4 : month + 8;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("salary.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const payslipId = Number(params.id);
  if (!Number.isFinite(payslipId) || payslipId <= 0) {
    return NextResponse.json({ error: "Invalid payslip id" }, { status: 400 });
  }
  const res = await query(
    `
    SELECT p.id, p.employee_id, p.month, p.year, p.paid_days, p.lop_days, p.gross_monthly, p.total_deductions, p.net_salary, p.net_salary_words, p.tax_sheet_snapshot, p.pdf_blob,
           u.full_name,
           s.employee_code, s.department, s.designation, s.date_of_joining, s.pan, s.uan_number, s.pf_number, s.bank_account_number, s.work_location
    FROM payslips p
    JOIN users u ON u.id = p.employee_id
    LEFT JOIN salary_structures s ON s.id = p.salary_structure_id
    WHERE p.id = $1
    LIMIT 1
    `,
    [payslipId]
  );
  if (res.rowCount === 0) return NextResponse.json({ error: "Payslip not found" }, { status: 404 });
  const row = res.rows[0] as any;
  let pdfBuffer = row.pdf_blob as Buffer | null;
  if (!pdfBuffer || !row.tax_sheet_snapshot) {
    const itemsRes = await query(
      `
      SELECT item_class, name, annual_amount, monthly_amount, amount_for_month, sort_order
      FROM payslip_line_items
      WHERE payslip_id = $1
      ORDER BY sort_order ASC, id ASC
      `,
      [payslipId]
    );
    const earnings = itemsRes.rows
      .filter((r: any) => r.item_class === "earning")
      .map((r: any) => ({
        name: String(r.name || "-"),
        annual: Number(r.annual_amount || 0),
        monthly: Number(r.monthly_amount || 0),
        amountForMonth: Number(r.amount_for_month || 0),
      }));
    const deductions = itemsRes.rows
      .filter((r: any) => r.item_class === "deduction")
      .map((r: any) => ({
        name: String(r.name || "-"),
        annual: Number(r.annual_amount || 0),
        monthly: Number(r.monthly_amount || 0),
        amountForMonth: Number(r.amount_for_month || 0),
      }));
    const monthLabel = new Date(Date.UTC(Number(row.year), Number(row.month) - 1, 1)).toLocaleString("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
    let taxSheetSnapshot: PayslipTaxSheetSnapshot | null =
      typeof row.tax_sheet_snapshot === "string"
        ? (JSON.parse(row.tax_sheet_snapshot) as PayslipTaxSheetSnapshot)
        : (row.tax_sheet_snapshot as PayslipTaxSheetSnapshot | null);
    if (!taxSheetSnapshot) {
      const tdsMonthly = Number(
        deductions.find((d: { name: string; amountForMonth: number }) => d.name.toLowerCase().includes("tds"))?.amountForMonth || 0
      );
      const annualTotalIncome = Math.round(Number(row.gross_monthly || 0) * 12 * 100) / 100;
      const standardDeduction = 75000;
      const taxable = Math.max(0, annualTotalIncome - standardDeduction);
      const incomeTaxPayable = Math.round(tdsMonthly * 12 * 100) / 100;
      const cess = Math.round((incomeTaxPayable * 0.04) * 100) / 100;
      const totalIncomeTaxPayable = Math.round((incomeTaxPayable + cess) * 100) / 100;
      const monthIndex = fyAprilIndex(Number(row.month));
      const monthlyTaxDeduction = new Array(12).fill(0);
      monthlyTaxDeduction[monthIndex] = tdsMonthly;
      taxSheetSnapshot = {
        titleMonthLabel: monthLabel,
        totalIncomeActualYtd: Number(row.gross_monthly || 0),
        projectedIncomeTillMarch: annualTotalIncome,
        annualTotalIncome,
        additionalIncome: 0,
        totalGrossIncome: annualTotalIncome,
        actualHraReceived: 0,
        grossSalaryBeforeStdDeduction: annualTotalIncome,
        standardDeduction,
        grossSalaryAfterStdDeduction: Math.max(0, annualTotalIncome - standardDeduction),
        totalIncomeFromSalary: Math.max(0, annualTotalIncome - standardDeduction),
        grossTaxableIncome: taxable,
        rebate: 0,
        totalInvestments: 0,
        netTaxableIncomeRoundedOff: Math.round(taxable),
        incomeTaxPayable,
        cess,
        totalIncomeTaxPayable,
        balanceTax: totalIncomeTaxPayable,
        monthlyTaxDeduction,
      };
      await query(`UPDATE payslips SET tax_sheet_snapshot = $2 WHERE id = $1`, [payslipId, JSON.stringify(taxSheetSnapshot)]);
    }
    const generated = await buildPayslipPdf({
      companyName: "AASTHIX TALENT",
      monthLabel,
      employeeName: String(row.full_name || "Employee"),
      employeeCode: String(row.employee_code || "-"),
      department: String(row.department || "-"),
      designation: String(row.designation || "-"),
      dateOfJoining: row.date_of_joining ? String(row.date_of_joining).slice(0, 10) : "-",
      pan: String(row.pan || "-"),
      uanNumber: String(row.uan_number || "-"),
      pfNumber: String(row.pf_number || "-"),
      bankAccountNumber: String(row.bank_account_number || "-"),
      workLocation: String(row.work_location || "-"),
      paidDays: Number(row.paid_days || 0),
      lopDays: Number(row.lop_days || 0),
      earnings,
      deductions,
      grossSalary: Number(row.gross_monthly || 0),
      totalDeductions: Number(row.total_deductions || 0),
      netSalary: Number(row.net_salary || 0),
      netSalaryInWords: String(row.net_salary_words || amountToRupeesWords(Math.round(Number(row.net_salary || 0)))),
      taxSheetSnapshot,
    });
    pdfBuffer = generated;
    await query(`UPDATE payslips SET pdf_blob = $2 WHERE id = $1`, [payslipId, generated]);
  }
  if (!pdfBuffer) return NextResponse.json({ error: "Payslip PDF not generated yet" }, { status: 404 });
  const safeName = String(row.full_name || "employee").replace(/[^a-z0-9_-]+/gi, "_");
  const filename = `payslip-${safeName}-${row.year}-${String(row.month).padStart(2, "0")}.pdf`;
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
