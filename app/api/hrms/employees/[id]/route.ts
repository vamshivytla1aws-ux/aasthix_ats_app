import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { deactivateEmployee, getEmployeeSelfProfile, updateEmployee, type EmployeeDirectoryInput } from "@/lib/hrms/employeeDirectory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: { id: string } }) {
  try {
    const auth = await requirePermission("employee_directory.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.access.role === "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id: idRaw } = context.params;
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
    const body = (await request.json().catch(() => null)) as Partial<EmployeeDirectoryInput> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    const current = await getEmployeeSelfProfile(id);
    if (!current) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    if (["admin", "workspace_owner"].includes(String(current.role)) && !["admin", "workspace_owner"].includes(auth.access.role)) return NextResponse.json({ error: "This account must be managed by an administrator." }, { status: 403 });
    const has = (key: keyof EmployeeDirectoryInput) => Object.prototype.hasOwnProperty.call(body, key);
    const text = (key: keyof EmployeeDirectoryInput, fallback: unknown) => String(has(key) ? body[key] ?? "" : fallback ?? "").trim();
    const fullName = text("fullName", current.full_name), email = text("email", current.email);
    if (!fullName) return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    const status = text("status", current.employment_status || "active"), role = text("role", current.role || "employee").toLowerCase();
    if (!["active", "inactive", "resigned"].includes(status)) return NextResponse.json({ error: "Invalid employment status." }, { status: 400 });
    if (role !== current.role && !["employee", "manager", "hiring_manager", "recruiter", "hr", "coordinator", "user"].includes(role)) return NextResponse.json({ error: "Use Access Control to change administrator roles." }, { status: 400 });
    if (id === auth.access.user_id && status !== "active") return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 409 });
    const joiningDate = text("joiningDate", current.joining_date);
    if (joiningDate) {
      const date = new Date(`${joiningDate}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(joiningDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== joiningDate) return NextResponse.json({ error: "Enter a valid date of joining." }, { status: 400 });
    }
    await updateEmployee(
      id,
      {
        employeeIdCode: text("employeeIdCode", current.employee_code), fullName, email,
        phone: text("phone", current.phone) || null,
        department: text("department", current.department) || null,
        designation: text("designation", current.designation) || null,
        employmentType: text("employmentType", current.employment_type) || null,
        joiningDate: joiningDate || null,
        reportingManagerUserId: has("reportingManagerUserId") ? body.reportingManagerUserId || null : has("reportingManagerEmail") ? null : Number(current.reporting_manager_user_id) || null,
        reportingManagerEmail: has("reportingManagerEmail") ? body.reportingManagerEmail || null : null,
        workLocation: text("workLocation", current.work_location) || null,
        status: status as "active" | "inactive" | "resigned", role,
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

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const auth = await requirePermission("employee_directory.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.access.role === "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: idRaw } = context.params;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid employee id." }, { status: 400 });
  if (id === auth.access.user_id) return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 409 });
  try {
    const current = await getEmployeeSelfProfile(id);
    if (!current) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    if (["admin", "workspace_owner"].includes(String(current.role)) && !["admin", "workspace_owner"].includes(auth.access.role)) return NextResponse.json({ error: "This account must be managed by an administrator." }, { status: 403 });
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
