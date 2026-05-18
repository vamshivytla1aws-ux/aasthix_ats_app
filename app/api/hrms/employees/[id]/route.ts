import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { deactivateEmployee, updateEmployee, type EmployeeDirectoryInput } from "@/lib/hrms/employeeDirectory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
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
        reportingManagerEmail: body.reportingManagerEmail || null,
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
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    return NextResponse.json(
      {
        operation_status: code === "MANAGER_NOT_FOUND" ? "blocked" : "error",
        user_message: error instanceof Error ? error.message : "Failed to update employee.",
      },
      { status: code === "MANAGER_NOT_FOUND" ? 400 : 500 },
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("employee_directory.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
  try {
    await deactivateEmployee(id, auth.access.user_id);
    return NextResponse.json({
      operation_status: "success",
      user_message: "Employee marked inactive.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        operation_status: "error",
        user_message: error instanceof Error ? error.message : "Failed to deactivate employee.",
      },
      { status: 500 },
    );
  }
}
