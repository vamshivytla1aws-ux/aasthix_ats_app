import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { importEmployees, type EmployeeDirectoryInput } from "@/lib/hrms/employeeDirectory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requirePermission("employee_directory.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.access.role === "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as
    | { rows?: Array<{ normalized?: EmployeeDirectoryInput; status?: string }> }
    | null;
  if (!body || !Array.isArray(body.rows)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const rows = body.rows
    .filter((item) => item?.status === "valid" && item.normalized)
    .map((item) => item.normalized as EmployeeDirectoryInput);

  if (rows.length === 0) {
    return NextResponse.json(
      {
        operation_status: "blocked",
        error: "No valid rows available for import.",
        user_message: "No valid rows available for import.",
      },
      { status: 400 },
    );
  }

  let result;
  try { result = await importEmployees(rows, auth.access.user_id); }
  catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    return NextResponse.json({ operation_status: "error", user_message: error instanceof Error ? error.message : "Unable to import employees." }, { status: code === "EMPLOYEE_SCHEMA_OUTDATED" ? 503 : 400 });
  }
  return NextResponse.json({
    operation_status: "success",
    user_message: `Imported ${result.created} employees successfully.`,
    created: result.created,
  });
}
