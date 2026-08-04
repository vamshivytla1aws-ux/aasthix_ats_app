import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { query } from "@/lib/db";
import type { PayslipTaxSheetSnapshot } from "@/lib/salary/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("salary.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payslipId = Number(params.id);
  if (!Number.isFinite(payslipId) || payslipId <= 0) {
    return NextResponse.json({ error: "Invalid payslip id" }, { status: 400 });
  }

  const res = await query(
    `
    SELECT p.id, p.employee_id, p.month, p.year, p.paid_days, p.lop_days, p.gross_monthly, p.total_deductions, p.net_salary, p.net_salary_words, p.tax_sheet_snapshot,
           u.full_name,
           s.employee_code, s.department, s.designation, s.date_of_joining, s.pan, s.uan_number, s.pf_number, s.bank_account_number, s.work_location, s.ctc_annual
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
  const employeeId = Number(row.employee_id || 0);

  if (access.role === "employee" && access.user_id !== employeeId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (access.role === "manager" || access.role === "hiring_manager") {
    const teamCheck = await query(
      `SELECT id FROM users WHERE id = $1 AND reporting_manager_user_id = $2 LIMIT 1`,
      [employeeId, access.user_id],
    );
    if (teamCheck.rowCount === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
      key: r.name,
      name: String(r.name || "-"),
      annual: Number(r.annual_amount || 0),
      monthly: Number(r.monthly_amount || 0),
      amountForMonth: Number(r.amount_for_month || 0),
      type: "earning",
      sortOrder: Number(r.sort_order),
    }));

  const deductions = itemsRes.rows
    .filter((r: any) => r.item_class === "deduction")
    .map((r: any) => ({
      key: r.name,
      name: String(r.name || "-"),
      annual: Number(r.annual_amount || 0),
      monthly: Number(r.monthly_amount || 0),
      amountForMonth: Number(r.amount_for_month || 0),
      type: "deduction",
      sortOrder: Number(r.sort_order),
    }));

  const monthLabel = new Date(Date.UTC(Number(row.year), Number(row.month) - 1, 1)).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  return NextResponse.json({
    data: {
      companyName: "AASTHIX TALENT",
      monthLabel,
      employeeName: String(row.full_name || ""),
      employeeCode: String(row.employee_code || ""),
      department: String(row.department || ""),
      designation: String(row.designation || ""),
      dateOfJoining: String(row.date_of_joining ? String(row.date_of_joining).slice(0, 10) : ""),
      pan: String(row.pan || ""),
      uanNumber: String(row.uan_number || ""),
      pfNumber: String(row.pf_number || ""),
      bankAccountNumber: String(row.bank_account_number || ""),
      workLocation: String(row.work_location || ""),
      paidDays: Number(row.paid_days || 0),
      lopDays: Number(row.lop_days || 0),
      calculation: {
        earningsAnnual: earnings,
        deductionsAnnual: deductions,
        grossMonthlySalary: Number(row.gross_monthly || 0),
        totalMonthlyDeductions: Number(row.total_deductions || 0),
        netMonthlySalary: Number(row.net_salary || 0),
        netSalaryInWords: String(row.net_salary_words || ""),
        summary: {
           ctcAnnual: Number(row.ctc_annual || 0),
        },
      }
    }
  });
}
