import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("salary.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const employeeId = Number(params.id);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return NextResponse.json({ error: "Invalid employee id" }, { status: 400 });
  }
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
  const res = await query(
    `
    SELECT p.id, p.month, p.year, p.paid_days, p.lop_days, p.gross_monthly, p.total_deductions, p.net_salary, p.net_salary_words, p.generated_at,
           s.employee_code, s.department, s.designation, u.full_name AS employee_name
    FROM payslips p
    JOIN salary_structures s ON s.id = p.salary_structure_id
    JOIN users u ON u.id = p.employee_id
    WHERE p.employee_id = $1
    ORDER BY p.year DESC, p.month DESC, p.generated_at DESC
    `,
    [employeeId]
  );
  return NextResponse.json({
    payslips: res.rows.map((row: any) => ({
      id: Number(row.id),
      month: Number(row.month),
      year: Number(row.year),
      paid_days: Number(row.paid_days || 0),
      lop_days: Number(row.lop_days || 0),
      gross_monthly: Number(row.gross_monthly || 0),
      total_deductions: Number(row.total_deductions || 0),
      net_salary: Number(row.net_salary || 0),
      net_salary_words: String(row.net_salary_words || ""),
      generated_at: String(row.generated_at),
      employee_code: String(row.employee_code || ""),
      employee_name: String(row.employee_name || ""),
      department: row.department ? String(row.department) : "",
      designation: row.designation ? String(row.designation) : "",
    })),
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("salary.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const payslipId = Number(params.id);
  if (!Number.isFinite(payslipId) || payslipId <= 0) {
    return NextResponse.json({ error: "Invalid payslip id" }, { status: 400 });
  }

  const exists = await query(`SELECT id FROM payslips WHERE id = $1 LIMIT 1`, [payslipId]);
  if (exists.rowCount === 0) {
    return NextResponse.json(
      {
        operation_status: "blocked",
        user_message: "Payslip not found.",
      },
      { status: 404 },
    );
  }

  await query(`DELETE FROM payslip_line_items WHERE payslip_id = $1`, [payslipId]);
  await query(`DELETE FROM payslips WHERE id = $1`, [payslipId]);
  return NextResponse.json({
    operation_status: "success",
    user_message: "Payslip deleted successfully.",
  });
}
