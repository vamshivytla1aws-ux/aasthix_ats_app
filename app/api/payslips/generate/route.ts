import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { amountToRupeesWords } from "@/lib/salary/numberToWords";
import { applyPayslipProration, getLatestSalaryStructure, toCalcInputFromStructure } from "@/lib/salary/service";
import { calculateSalaryStructure } from "@/lib/salary/engine";
import { query } from "@/lib/db";
import { buildPayslipPdf } from "@/lib/pdf/payslipExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requirePermission("salary.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as
    | { employeeId?: number; month?: number; year?: number; paidDays?: number; lopDays?: number }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const employeeId = Number(body.employeeId);
  const month = Number(body.month);
  const year = Number(body.year);
  const paidDays = Number(body.paidDays);
  const lopDays = Number(body.lopDays);

  if (!Number.isFinite(employeeId) || employeeId <= 0) return NextResponse.json({ error: "Invalid employeeId" }, { status: 400 });
  if (!(month >= 1 && month <= 12) || !(year >= 2000)) return NextResponse.json({ error: "Invalid month/year" }, { status: 400 });

  const latest = await getLatestSalaryStructure(employeeId);
  if (!latest) return NextResponse.json({ error: "Salary structure not found for employee" }, { status: 404 });

  const input = toCalcInputFromStructure(latest.structure);
  const calc = await calculateSalaryStructure(input);
  const prorated = applyPayslipProration(
    calc,
    Number.isFinite(paidDays) && paidDays > 0 ? paidDays : Number(latest.structure.total_paid_days || 30),
    Number.isFinite(lopDays) && lopDays >= 0 ? lopDays : Number(latest.structure.lop_days || 0)
  );
  const netSalaryWords = amountToRupeesWords(Math.round(prorated.net));

  const employeeName = String(latest.structure.employee_name || "Employee");
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const pdfBytes = await buildPayslipPdf({
    companyName: "AASTHIX TALENT",
    monthLabel,
    employeeName,
    employeeCode: String(latest.structure.employee_code || "-"),
    department: String(latest.structure.department || "-"),
    designation: String(latest.structure.designation || "-"),
    dateOfJoining: latest.structure.date_of_joining ? String(latest.structure.date_of_joining).slice(0, 10) : "-",
    pan: String(latest.structure.pan || "-"),
    uanNumber: String(latest.structure.uan_number || "-"),
    pfNumber: String(latest.structure.pf_number || "-"),
    bankAccountNumber: String(latest.structure.bank_account_number || "-"),
    workLocation: String(latest.structure.work_location || "-"),
    paidDays: Number.isFinite(paidDays) ? paidDays : Number(latest.structure.total_paid_days || 30),
    lopDays: Number.isFinite(lopDays) ? lopDays : Number(latest.structure.lop_days || 0),
    earnings: prorated.earnings,
    deductions: prorated.deductions,
    grossSalary: prorated.grossMonthly,
    totalDeductions: prorated.totalDeductions,
    netSalary: prorated.net,
    netSalaryInWords: netSalaryWords,
  });

  const upsert = await query(
    `
    INSERT INTO payslips
    (employee_id, salary_structure_id, month, year, paid_days, lop_days, gross_monthly, total_deductions, net_salary, net_salary_words, pdf_blob, generated_at, created_by_user_id, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12,NOW())
    ON CONFLICT (employee_id, year, month)
    DO UPDATE SET
      salary_structure_id = EXCLUDED.salary_structure_id,
      paid_days = EXCLUDED.paid_days,
      lop_days = EXCLUDED.lop_days,
      gross_monthly = EXCLUDED.gross_monthly,
      total_deductions = EXCLUDED.total_deductions,
      net_salary = EXCLUDED.net_salary,
      net_salary_words = EXCLUDED.net_salary_words,
      pdf_blob = EXCLUDED.pdf_blob,
      generated_at = NOW(),
      created_by_user_id = EXCLUDED.created_by_user_id
    RETURNING id
    `,
    [
      employeeId,
      Number(latest.structure.id),
      month,
      year,
      Number.isFinite(paidDays) ? paidDays : Number(latest.structure.total_paid_days || 30),
      Number.isFinite(lopDays) ? lopDays : Number(latest.structure.lop_days || 0),
      prorated.grossMonthly,
      prorated.totalDeductions,
      prorated.net,
      netSalaryWords,
      pdfBytes,
      auth.access.user_id,
    ]
  );
  const payslipId = Number(upsert.rows[0].id);
  await query(`DELETE FROM payslip_line_items WHERE payslip_id = $1`, [payslipId]);
  for (const row of [...prorated.earnings, ...prorated.deductions]) {
    await query(
      `
      INSERT INTO payslip_line_items
      (payslip_id, item_class, name, annual_amount, monthly_amount, amount_for_month, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [payslipId, row.type, row.name, row.annual, row.monthly, row.amountForMonth || 0, row.sortOrder]
    );
  }

  return NextResponse.json({
    ok: true,
    payslipId,
    month,
    year,
    grossMonthly: prorated.grossMonthly,
    totalDeductions: prorated.totalDeductions,
    netSalary: prorated.net,
    netSalaryWords,
  });
}
