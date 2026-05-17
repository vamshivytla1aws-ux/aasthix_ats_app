import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { deactivateEmployee, updateEmployee, type EmployeeDirectoryInput } from "@/lib/hrms/employeeDirectory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canTouchEmployee(access: NonNullable<Awaited<ReturnType<typeof getAuthAccess>>>, employeeId: number) {
  if (access.role === "admin") return true;
  if (access.permissions["employee_directory.manage"]) return true;
  return access.user_id === employeeId;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("employee_directory.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as Partial<EmployeeDirectoryInput> | null;
  if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  if (!body.employeeIdCode?.trim()) return NextResponse.json({ error: "Employee ID is required." }, { status: 400 });
  if (!body.fullName?.trim()) return NextResponse.json({ error: "Full name is required." }, { status: 400 });
  if (!body.email?.trim()) return NextResponse.json({ error: "Email is required." }, { status: 400 });
  await updateEmployee(
    id,
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
      workLocation: body.workLocation || null,
      status: (body.status || "active") as "active" | "inactive" | "resigned",
      role: body.role || "employee",
    },
    auth.access.user_id,
  );
  return NextResponse.json({
    operation_status: "success",
    user_message: "Employee updated successfully.",
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
  if (!canTouchEmployee(access, id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await deactivateEmployee(id, access.user_id);
  return NextResponse.json({
    operation_status: "success",
    user_message: "Employee marked inactive.",
  });
}
