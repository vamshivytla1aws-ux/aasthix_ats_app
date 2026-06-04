import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseStartYear(raw: string | null) {
  const year = Number(raw || 0);
  return Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : null;
}

function financialYearWindow(startYear: number) {
  return {
    startYear,
    endYear: startYear + 1,
    startMonth: 4,
    endMonth: 3,
  };
}

function monthKey(year: number, month: number) {
  return year * 100 + month;
}

type AnnualPayslipRow = {
  id: number;
  employee_id: number;
  month: number;
  year: number;
  paid_days: number;
  lop_days: number;
  gross_monthly: number;
  total_deductions: number;
  net_salary: number;
  generated_at: string;
  employee_name: string;
  employee_code: string;
  department: string;
  designation: string;
};

export async function GET(request: Request) {
  const auth = await requirePermission("salary.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const requestedEmployeeId = Number(url.searchParams.get("employee_id") || 0);
  const employeeId = Number.isFinite(requestedEmployeeId) && requestedEmployeeId > 0 ? requestedEmployeeId : access.user_id;
  const startYear = parseStartYear(url.searchParams.get("start_year"));

  if (access.role === "employee" && employeeId !== access.user_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if ((access.role === "manager" || access.role === "hiring_manager") && employeeId !== access.user_id) {
    const teamCheck = await query(
      `SELECT id FROM users WHERE id = $1 AND reporting_manager_user_id = $2 LIMIT 1`,
      [employeeId, access.user_id],
    );
    if (teamCheck.rowCount === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rowsRes = await query(
    `
      SELECT
        p.id,
        p.employee_id,
        p.month,
        p.year,
        p.paid_days,
        p.lop_days,
        p.gross_monthly,
        p.total_deductions,
        p.net_salary,
        p.generated_at,
        u.full_name AS employee_name,
        COALESCE(s.employee_code, '') AS employee_code,
        COALESCE(s.department, '') AS department,
        COALESCE(s.designation, '') AS designation
      FROM payslips p
      JOIN users u ON u.id = p.employee_id
      LEFT JOIN salary_structures s ON s.id = p.salary_structure_id
      WHERE p.employee_id = $1
      ORDER BY p.year DESC, p.month DESC, p.generated_at DESC
    `,
    [employeeId],
  );

  const rows: AnnualPayslipRow[] = rowsRes.rows.map((row: any) => ({
    id: Number(row.id),
    employee_id: Number(row.employee_id),
    month: Number(row.month),
    year: Number(row.year),
    paid_days: Number(row.paid_days || 0),
    lop_days: Number(row.lop_days || 0),
    gross_monthly: Number(row.gross_monthly || 0),
    total_deductions: Number(row.total_deductions || 0),
    net_salary: Number(row.net_salary || 0),
    generated_at: String(row.generated_at || ""),
    employee_name: String(row.employee_name || ""),
    employee_code: String(row.employee_code || ""),
    department: String(row.department || ""),
    designation: String(row.designation || ""),
  }));

  if (rows.length === 0) {
    return NextResponse.json({
      statement: null,
      financial_years: [],
    });
  }

  const yearOptions = Array.from(
    new Set(
      rows.map((row) => (row.month >= 4 ? row.year : row.year - 1)).filter((year) => Number.isFinite(year)),
    ),
  ).sort((a, b) => b - a);

  const effectiveStartYear = startYear ?? yearOptions[0];
  const fy = financialYearWindow(effectiveStartYear);
  const minKey = monthKey(fy.startYear, fy.startMonth);
  const statementRows = rows
    .filter((row) => {
      const key = monthKey(row.year, row.month);
      if (row.year === fy.startYear) return key >= minKey;
      if (row.year === fy.endYear) return row.month <= fy.endMonth;
      return false;
    })
    .sort((a, b) => monthKey(a.year, a.month) - monthKey(b.year, b.month));

  const totals = statementRows.reduce(
    (acc, row) => {
      acc.gross += row.gross_monthly;
      acc.deductions += row.total_deductions;
      acc.net += row.net_salary;
      return acc;
    },
    { gross: 0, deductions: 0, net: 0 },
  );

  return NextResponse.json({
    financial_years: yearOptions.map((year) => ({
      start_year: year,
      label: `FY ${year}-${String(year + 1).slice(-2)}`,
    })),
    statement: {
      employee_id: employeeId,
      employee_name: rows[0].employee_name,
      employee_code: rows[0].employee_code,
      department: rows[0].department,
      designation: rows[0].designation,
      start_year: fy.startYear,
      label: `FY ${fy.startYear}-${String(fy.endYear).slice(-2)}`,
      months: statementRows,
      totals,
    },
  });
}
