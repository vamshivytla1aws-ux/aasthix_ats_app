import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/rbac", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/hrms/employeeDirectory", () => ({ getEmployeeSelfProfile: vi.fn(), updateEmployee: vi.fn(), deactivateEmployee: vi.fn() }));
import { PATCH, DELETE } from "@/app/api/hrms/employees/[id]/route";
import { requirePermission } from "@/lib/rbac";
import { getEmployeeSelfProfile, updateEmployee, deactivateEmployee } from "@/lib/hrms/employeeDirectory";
const employee = { id: 12, role: "employee", employee_code: "EMP-12", full_name: "Test Employee", email: "employee@example.test", phone: "12345", department: "Engineering", designation: "SDE II", joining_date: "2026-05-13", employment_status: "active", reporting_manager_user_id: 2, profile_completeness: 90 };
const context = { params: { id: "12" } };
const request = (data = {}) => new Request("http://localhost/test", { method: "PATCH", body: JSON.stringify(data) });
describe("HR employee profile management", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(requirePermission).mockResolvedValue({ ok: true, access: { user_id: 1, role: "hr" } } as any); vi.mocked(getEmployeeSelfProfile).mockResolvedValue(employee); });
  it("clears an optional field without overwriting unrelated details", async () => {
    expect((await PATCH(request({ phone: "" }), context)).status).toBe(200);
    expect(updateEmployee).toHaveBeenCalledWith(12, expect.objectContaining({ phone: null, department: "Engineering", joiningDate: "2026-05-13", reportingManagerUserId: 2, fullName: "Test Employee", email: employee.email }), 1);
  });
  it("can clear all optional details", async () => {
    expect((await PATCH(request({ employeeIdCode: "", phone: "", department: "", designation: "", employmentType: "", joiningDate: "", reportingManagerEmail: "", workLocation: "" }), context)).status).toBe(200);
    expect(updateEmployee).toHaveBeenCalledWith(12, expect.objectContaining({ employeeIdCode: "", phone: null, department: null, designation: null, joiningDate: null, reportingManagerUserId: null, workLocation: null }), 1);
  });
  it.each([{ fullName: "" }, { email: "" }, { email: "not-an-email" }, { joiningDate: "2026-02-30" }, { status: "deleted" }, { role: "workspace_owner" }])("rejects invalid changes %j", async data => {
    expect((await PATCH(request(data), context)).status).toBe(400);
    expect(updateEmployee).not.toHaveBeenCalled();
  });
  it("deactivates an employee without deleting their history", async () => {
    expect((await DELETE(request(), context)).status).toBe(200);
    expect(deactivateEmployee).toHaveBeenCalledWith(12, 1);
    expect(updateEmployee).not.toHaveBeenCalled();
  });
  it("can reactivate through the profile status", async () => {
    vi.mocked(getEmployeeSelfProfile).mockResolvedValue({ ...employee, employment_status: "inactive" });
    expect((await PATCH(request({ status: "active" }), context)).status).toBe(200);
    expect(updateEmployee).toHaveBeenCalledWith(12, expect.objectContaining({ status: "active" }), 1);
  });
  it("prevents self-deactivation", async () => {
    expect((await DELETE(request(), { params: { id: "1" } })).status).toBe(409);
    expect(deactivateEmployee).not.toHaveBeenCalled();
  });
  it("requires HR management permission", async () => {
    vi.mocked(requirePermission).mockResolvedValue({ ok: false, status: 403, error: "Forbidden" } as any);
    expect((await PATCH(request(), context)).status).toBe(403);
    expect((await DELETE(request(), context)).status).toBe(403);
    expect(getEmployeeSelfProfile).not.toHaveBeenCalled();
  });
  it("does not let employee sessions manage profiles", async () => {
    vi.mocked(requirePermission).mockResolvedValue({ ok: true, access: { user_id: 12, role: "employee" } } as any);
    expect((await PATCH(request(), context)).status).toBe(403);
    expect((await DELETE(request(), context)).status).toBe(403);
  });
  it("protects administrator profiles from HR edits", async () => {
    vi.mocked(getEmployeeSelfProfile).mockResolvedValue({ ...employee, role: "workspace_owner" });
    expect((await PATCH(request({ phone: "" }), context)).status).toBe(403);
    expect((await DELETE(request(), context)).status).toBe(403);
  });
});
