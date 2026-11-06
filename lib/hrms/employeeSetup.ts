import { query } from "@/lib/db";
import { getEffectivePermissions, type AuthAccess } from "@/lib/rbac";
import { EMPLOYEE_FEATURES } from "@/lib/hrms/employeeFeatures";

export type SetupItem = { key: "details" | "login" | "salary" | "documents"; label: string; status: "complete" | "needs_attention" | "optional" | "unavailable"; detail: string };
export type EmployeeSetup = { employeeId: number; items: SetupItem[]; canSetLogin: boolean; canGeneratePayslip: boolean; canManageAccess: boolean; features: Array<{ id: string; label: string; enabled: boolean }> };

export async function getEmployeeSetup(employeeId: number, access: AuthAccess): Promise<EmployeeSetup | null> {
  const result = await query(`SELECT id, role, full_name, email, department, employment_type, joining_date, reporting_manager_user_id,
    COALESCE(is_active, true) AS is_active, COALESCE(employment_status, 'active') AS employment_status,
    password_hash IS NOT NULL AS login_ready FROM users WHERE id = $1`, [employeeId]);
  const employee = result.rows[0];
  if (!employee) return null;
  if (["manager", "hiring_manager"].includes(access.role) && employeeId !== access.user_id && Number(employee.reporting_manager_user_id) !== access.user_id) return null;
  const canSeeSalary = access.permissions["salary.view"] === true || access.permissions["salary.manage"] === true;
  const canSeeDocuments = access.permissions["documents.view_all"] === true;
  const [salary, documents, policies, permissions] = await Promise.all([
    canSeeSalary ? query("SELECT id, ctc_annual FROM salary_structures WHERE employee_id = $1 ORDER BY effective_from DESC, id DESC LIMIT 1", [employeeId]) : null,
    canSeeDocuments ? query("SELECT category FROM employee_documents WHERE user_id = $1", [employeeId]) : null,
    canSeeDocuments ? query("SELECT category, department, employment_type FROM hrms_document_policies WHERE is_active = true AND is_mandatory = true", []) : null,
    query("SELECT permission_key, allowed FROM user_permissions WHERE user_id = $1", [employeeId]),
  ]);
  const effective = getEffectivePermissions(employee.role, new Map(permissions.rows.map((row: { permission_key: string; allowed: boolean }) => [row.permission_key, row.allowed])));
  const active = employee.is_active && employee.employment_status === "active";
  const salaryReady = Boolean(salary?.rows[0] && Number(salary.rows[0].ctc_annual) > 0);
  const categories = new Set(documents?.rows.map((row: { category: string }) => row.category) || []);
  const required = (policies?.rows || []).filter((row: { department?: string; employment_type?: string }) =>
    (!row.department || row.department.toLowerCase() === String(employee.department || "").toLowerCase()) &&
    (!row.employment_type || row.employment_type.toLowerCase() === String(employee.employment_type || "").toLowerCase()));
  const missing = required.filter((row: { category: string }) => !categories.has(row.category)).length;
  return { employeeId,
    items: [
      { key: "details", label: "Profile details", status: employee.full_name && employee.email ? "complete" : "needs_attention", detail: "Name and email are required. Other personal details are optional." },
      { key: "login", label: "Employee login", status: employee.role !== "employee" ? "optional" : active && employee.login_ready ? "complete" : "needs_attention",
        detail: employee.role !== "employee" ? "This account uses staff sign in." : !active ? "Employee access is inactive." : !employee.joining_date ? "Add a joining date to set the initial password." : employee.login_ready ? "Employee sign in is ready." : "Set the joining-date password." },
      { key: "salary", label: "Salary setup", status: !canSeeSalary ? "unavailable" : salaryReady ? "complete" : "needs_attention", detail: !canSeeSalary ? "Salary access is not enabled for your account." : salaryReady ? "Salary setup is saved. Missing optional bank or PF details do not block generation." : "Save a salary structure before generating a payslip." },
      { key: "documents", label: "Documents", status: !canSeeDocuments ? "unavailable" : missing ? "needs_attention" : categories.size ? "complete" : "optional", detail: !canSeeDocuments ? "Document access is not enabled for your account." : missing ? `${missing} document category/categories required by the configured policy are missing.` : categories.size ? "Employee documents have been added." : "No documents added. No configured mandatory documents are missing." },
    ],
    canSetLogin: Boolean(active && employee.role === "employee" && employee.joining_date && access.permissions["employee_directory.manage"]),
    canGeneratePayslip: salaryReady && access.permissions["salary.manage"] === true,
    canManageAccess: access.role === "workspace_owner",
    features: EMPLOYEE_FEATURES.map(feature => ({ id: feature.id, label: feature.label, enabled: effective[feature.view] === true })),
  };
}
