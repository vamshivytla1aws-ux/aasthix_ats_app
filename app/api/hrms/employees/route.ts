import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { createEmployee, listEmployees, type EmployeeDirectoryInput } from "@/lib/hrms/employeeDirectory";

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
  const rows = await listEmployees({
    actorUserId: access.user_id,
    role: access.role,
    q,
    department,
    status,
  });
  return NextResponse.json({ employees: rows });
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("employee_directory.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = (await request.json().catch(() => null)) as Partial<EmployeeDirectoryInput> | null;
    if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    if (!body.employeeIdCode?.trim()) return NextResponse.json({ error: "Employee ID is required." }, { status: 400 });
    if (!body.fullName?.trim()) return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    if (!body.email?.trim()) return NextResponse.json({ error: "Email is required." }, { status: 400 });
    const role = String(body.role || "employee").trim().toLowerCase();
    const managerOptional = role === "manager" || role === "hr" || role === "admin";
    if (!managerOptional && !Number(body.reportingManagerUserId) && !String(body.reportingManagerEmail || "").trim()) {
      return NextResponse.json({ error: "Select reporting manager or enter manager email." }, { status: 400 });
    }
    const id = await createEmployee(
      {
        employeeIdCode: body.employeeIdCode,
        fullName: body.fullName,
        email: body.email,
        phone: body.phone || null,
        department: body.department || null,
        designation: body.designation || null,
        employmentType: body.employmentType || null,
        joiningDate: body.joiningDate || null,
        reportingManagerUserId: body.reportingManagerUserId || null,
        reportingManagerEmail: body.reportingManagerEmail || null,
        workLocation: body.workLocation || null,
        status: (body.status || "active") as "active" | "inactive" | "resigned",
        role: body.role || "employee",
      },
      auth.access.user_id,
    );
    return NextResponse.json({
      id,
      operation_status: "success",
      user_message: "Employee created successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        operation_status: "error",
        user_message: error instanceof Error ? error.message : "Failed to create employee.",
      },
      { status: 500 },
    );
  }
}
