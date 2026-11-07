import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthAccess, type AuthAccess } from "@/lib/rbac";
import { CORRECTION_CATEGORIES, CORRECTION_FIELDS, type CorrectionCategory } from "@/lib/hrms/corrections";
import { canAccessSalaryEmployee } from "@/lib/salary/access";
import { salaryMonthPattern } from "@/lib/salary/packageReview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fields = "id, category, subject, description, status, resolution_note";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

function categoryOf(value: unknown): CorrectionCategory | null {
  return CORRECTION_CATEGORIES.find(category => category === value) ?? null;
}

async function canRead(access: AuthAccess, employeeId: number, category: CorrectionCategory) {
  if (access.role === "employee") {
    return access.user_id === employeeId && access.permissions[category === "profile" ? "employee_directory.view_self" : "salary.view"] === true;
  }
  return access.permissions["employee_directory.view_all"] === true
    && (category === "profile" || access.permissions["salary.view"] === true)
    && await canAccessSalaryEmployee(access, employeeId);
}

export async function GET(request: Request) {
  const access = await getAuthAccess();
  if (!access) return fail("Unauthorized", 401);
  const params = new URL(request.url).searchParams;
  const category = categoryOf(params.get("category"));
  const employeeId = Number(params.get("employeeId") ?? access.user_id);
  if (!category || !Number.isSafeInteger(employeeId) || employeeId <= 0) return fail("Invalid correction request filter.", 400);
  if (!await canRead(access, employeeId, category)) return fail("Forbidden", 403);
  const result = await query(`SELECT ${fields} FROM hrms_correction_requests WHERE employee_id = $1 AND category = $2
    ORDER BY (status = 'pending') DESC, id DESC`, [employeeId, category]);
  return NextResponse.json({ requests: result.rows });
}

export async function POST(request: Request) {
  const access = await getAuthAccess();
  if (!access) return fail("Unauthorized", 401);
  const body = await request.json().catch(() => null);
  const category = categoryOf(body?.category);
  if (!category) return fail("Choose a correction category.", 400);
  if (access.role !== "employee" || (body.employeeId != null && body.employeeId !== access.user_id)
    || !await canRead(access, access.user_id, category)) return fail("Forbidden", 403);
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const validSubject = category === "payslip" ? salaryMonthPattern.test(subject) : CORRECTION_FIELDS[category].includes(subject);
  if (!validSubject || !description || description.length > 1000) return fail("Select a field or payslip month and describe the correction in up to 1,000 characters.", 400);
  if (category === "payslip") {
    const [year, month] = subject.split("-").map(Number);
    const payslip = await query("SELECT 1 FROM payslips WHERE employee_id = $1 AND year = $2 AND month = $3", [access.user_id, year, month]);
    if (!payslip.rowCount) return fail("Choose a month with an issued payslip.", 400);
  }
  const result = await query(`INSERT INTO hrms_correction_requests (employee_id, category, subject, description)
    VALUES ($1, $2, $3, $4) RETURNING ${fields}`, [access.user_id, category, subject, description]);
  return NextResponse.json({ request: result.rows[0] }, { status: 201 });
}

export async function PATCH(request: Request) {
  const access = await getAuthAccess();
  if (!access) return fail("Unauthorized", 401);
  const body = await request.json().catch(() => null);
  const category = categoryOf(body?.category);
  const employeeId = Number(body?.employeeId);
  const id = Number(body?.id);
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  const status = body?.status;
  if (!category || !Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(employeeId) || employeeId <= 0
    || (status !== "resolved" && status !== "declined") || !note || note.length > 1000) {
    return fail("Choose an outcome and enter a closing note of up to 1,000 characters.", 400);
  }
  if (access.role === "employee" || !access.permissions[category === "profile" ? "employee_directory.manage" : "salary.manage"]
    || !await canRead(access, employeeId, category)) return fail("Forbidden", 403);
  const result = await query(`UPDATE hrms_correction_requests SET status = $1, resolution_note = $2, closed_by = $3, closed_at = NOW()
    WHERE id = $4 AND employee_id = $5 AND category = $6 AND status = 'pending' RETURNING ${fields}`,
  [status, note, access.user_id, id, employeeId, category]);
  return result.rowCount ? NextResponse.json({ request: result.rows[0] }) : fail("This request is no longer pending or could not be found.", 409);
}
