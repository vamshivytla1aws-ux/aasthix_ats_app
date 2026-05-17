import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { applyImportConflictChecks, type EmployeeImportRow, validateImportRows } from "@/lib/hrms/employeeDirectory";
import { parseCsv } from "@/lib/hrms/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED_HEADERS = [
  "employeeIdCode",
  "fullName",
  "email",
  "phone",
  "department",
  "designation",
  "employmentType",
  "joiningDate",
  "reportingManagerUserId",
  "workLocation",
  "status",
  "role",
] as const;

export async function POST(request: Request) {
  const auth = await requirePermission("employee_directory.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "CSV file is required." }, { status: 400 });

  const csvText = await file.text();
  const rows = parseCsv(csvText);
  if (rows.length <= 1) return NextResponse.json({ error: "CSV must contain headers and at least one row." }, { status: 400 });
  const header = rows[0];

  const headerIndex = new Map<string, number>();
  header.forEach((item, index) => headerIndex.set(item.trim(), index));
  const missingHeaders = REQUIRED_HEADERS.filter((column) => !headerIndex.has(column));
  if (missingHeaders.length > 0) {
    return NextResponse.json(
      {
        operation_status: "blocked",
        error: `Missing required headers: ${missingHeaders.join(", ")}`,
        user_message: `Missing required headers: ${missingHeaders.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const importRows: EmployeeImportRow[] = rows.slice(1).map((cells, idx) => {
    const row: Record<string, string> = {};
    for (const column of REQUIRED_HEADERS) {
      const index = Number(headerIndex.get(column));
      row[column] = index >= 0 ? String(cells[index] || "").trim() : "";
    }
    return {
      rowNumber: idx + 2,
      employeeIdCode: row.employeeIdCode,
      fullName: row.fullName,
      email: row.email,
      phone: row.phone || null,
      department: row.department || null,
      designation: row.designation || null,
      employmentType: row.employmentType || null,
      joiningDate: row.joiningDate || null,
      reportingManagerUserId: row.reportingManagerUserId ? Number(row.reportingManagerUserId) : null,
      workLocation: row.workLocation || null,
      status: (row.status || "active") as "active" | "inactive" | "resigned",
      role: row.role || "employee",
    };
  });

  const validated = validateImportRows(importRows);
  const checked = await applyImportConflictChecks(validated);
  const summary = checked.reduce<{ valid: number; invalid: number; conflict: number }>((acc, item) => {
    if (item.status === "valid") acc.valid += 1;
    else if (item.status === "invalid") acc.invalid += 1;
    else acc.conflict += 1;
    return acc;
  }, { valid: 0, invalid: 0, conflict: 0 });

  return NextResponse.json({
    operation_status: "success",
    user_message: "CSV parsed successfully.",
    rows: checked,
    summary,
  });
}
