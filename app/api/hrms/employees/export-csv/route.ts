import { NextResponse } from "next/server";
import { getAuthAccess } from "@/lib/rbac";
import { listEmployees } from "@/lib/hrms/employeeDirectory";
import { toCsv } from "@/lib/hrms/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canViewEmployees(access: NonNullable<Awaited<ReturnType<typeof getAuthAccess>>>) {
  if (access.role === "admin") return true;
  return Boolean(
    access.permissions["employee_directory.view_all"] ||
      access.permissions["employee_directory.view_team"] ||
      access.permissions["employee_directory.view_self"],
  );
}

export async function GET(request: Request) {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewEmployees(access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const department = url.searchParams.get("department") || "";
  const status = url.searchParams.get("status") || "";
  const rows = await listEmployees({ actorUserId: access.user_id, role: access.role, q, department, status });

  const csv = toCsv(
    rows.map((row: any) => ({
      employee_code: row.employee_code || "",
      full_name: row.full_name || "",
      email: row.email || "",
      phone: row.phone || "",
      department: row.department || "",
      designation: row.designation || "",
      employment_type: row.employment_type || "",
      joining_date: row.joining_date ? String(row.joining_date).slice(0, 10) : "",
      reporting_manager_name: row.reporting_manager_name || "",
      work_location: row.work_location || "",
      status: row.employment_status || "",
      profile_completeness: Number(row.profile_completeness || 0),
    })),
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"employees.csv\"",
    },
  });
}
