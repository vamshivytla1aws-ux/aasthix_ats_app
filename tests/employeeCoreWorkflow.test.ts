import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ access: { user_id: 1, email: "hr@example.test", role: "hr", access_scope: "all", permissions: {} as Record<string, boolean> } }));
vi.mock("@/lib/rbac", async original => ({ ...await original<typeof import("@/lib/rbac")>(), getAuthAccess: vi.fn(async () => state.access),
  requirePermission: vi.fn(async (key: string) => state.access.permissions[key] ? { ok: true, access: state.access } : { ok: false, status: 403, error: "Forbidden" }) }));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
import { query } from "@/lib/db";
import { getEffectivePermissions } from "@/lib/rbac";
import { featurePermissionPatch } from "@/lib/hrms/employeeFeatures";
import { monthWindow, monthAttendance } from "@/lib/hrms/employeeMonth";
import { GET as monthly } from "@/app/api/hrms/employees/[id]/monthly-records/route";
import { GET as setup } from "@/app/api/hrms/employees/[id]/setup/route";
import { POST as checkIn } from "@/app/api/attendance/check-in/route";
import { POST as applyLeave } from "@/app/api/leave/requests/route";
import { POST as saveTimesheet } from "@/app/api/timesheet/header/route";
import { POST as saveEntry } from "@/app/api/timesheet/entries/route";
import { GET as timesheetSummary } from "@/app/api/timesheet/summary/route";
import { listEmployeeDocuments } from "@/lib/hrms/documents";

const employee = { id: 12, full_name: "Sample Employee", email: "sample@example.test", role: "employee", reporting_manager_user_id: 1,
  department: "Engineering", employment_type: "Full time", joining_date: "2026-05-13", is_active: true, employment_status: "active", login_ready: true };
const context = { params: { id: "12" } };
const request = (month = "2026-05") => new Request(`http://localhost/test?month=${month}`);
beforeEach(() => {
  vi.clearAllMocks(); state.access.role = "hr"; state.access.user_id = 1;
  state.access.permissions = { "employee_directory.view_all": true, "attendance.view_all": true, "leave.manage_policy": true, "salary.view": true, "salary.manage": true, "employee_directory.manage": true, "documents.view_all": true };
  vi.mocked(query).mockImplementation(async (sql: string) => {
    let rows: any[] = [];
    if (sql.includes("FROM users")) rows = [employee];
    else if (sql.includes("FROM salary_structures")) rows = [{ id: 2, ctc_annual: 1800000 }];
    else if (sql.includes("FROM attendance_records")) rows = [{ attendance_date: "2026-05-14", status: "present", total_minutes: 480 }];
    else if (sql.includes("FROM leave_requests")) rows = [{ id: 4, from_date: "2026-04-29", to_date: "2026-05-02", status: "approved" }];
    return { rows, rowCount: rows.length };
  });
});
describe("monthly employee records", () => {
  it("returns recorded attendance and overlapping leave without writes", async () => {
    const response = await monthly(request(), context), data = await response.json();
    expect(response.status).toBe(200);
    expect(data.attendance.totals).toMatchObject({ present: 1, absent: 0, notRecorded: 30 });
    expect(data.leave.requests[0].from_date).toBe("2026-04-29");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("r.from_date < $3::date AND r.to_date >= $2::date"), [12, "2026-05-01", "2026-06-01"]);
    expect(vi.mocked(query).mock.calls.every(([sql]) => sql.trim().startsWith("SELECT"))).toBe(true);
  });
  it("does not infer absences in an empty month", () => {
    expect(monthAttendance("2024-02", []).totals).toMatchObject({ present: 0, absent: 0, notRecorded: 29 });
  });
  it.each(["2026-00", "2026-13", "bad", "2026-5", "1999-12"])("rejects invalid months %s", month => {
    expect(() => monthWindow(month)).toThrow();
  });
  it("blocks employees probing someone else's records before any query", async () => {
    state.access.role = "employee"; state.access.user_id = 99;
    expect((await monthly(request(), context)).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it("returns only the section an employee can view", async () => {
    state.access.role = "employee"; state.access.user_id = 12;
    state.access.permissions = { "attendance.view_self": true };
    const data = await (await monthly(request(), context)).json();
    expect(data.attendance.available).toBe(true); expect(data.leave.available).toBe(false);
    expect(vi.mocked(query).mock.calls.some(([sql]) => sql.includes("FROM leave_requests"))).toBe(false);
  });
  it("restricts team leave to the mapped manager", async () => {
    state.access.user_id = 99; state.access.permissions = { "leave.approve_team": true };
    expect((await monthly(request(), context)).status).toBe(403);
  });
  it("limits manager leave results to requests assigned to that manager", async () => {
    state.access.permissions = { "leave.approve_team": true };
    const data = await (await monthly(request(), context)).json();
    expect(data.leave.available).toBe(true); expect(data.attendance.available).toBe(false);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("AND r.manager_user_id = $4"), [12, "2026-05-01", "2026-06-01", 1]);
  });
});
describe("employee setup checklist", () => {
  it("does not block a saved salary for missing optional bank, PAN, PF or documents", async () => {
    const data = await (await setup(request(), context)).json();
    expect(data.canGeneratePayslip).toBe(true); expect(data.canSetLogin).toBe(true);
    expect(data.items.find((item: any) => item.key === "documents").status).toBe("optional");
    expect(data.items.find((item: any) => item.key === "salary").status).toBe("complete");
    expect(data.canManageAccess).toBe(false);
  });
  it("flags missing configured mandatory documents", async () => {
    vi.mocked(query).mockImplementation(async (sql: string) => ({ rows: sql.includes("FROM users") ? [employee] : sql.includes("hrms_document_policies") ? [{ category: "offer_letter", department: "Engineering" }] : [], rowCount: 1 }));
    const data = await (await setup(request(), context)).json();
    expect(data.items.find((item: any) => item.key === "documents").status).toBe("needs_attention");
    expect(data.canGeneratePayslip).toBe(false);
  });
  it("requires a joining date for login only", async () => {
    vi.mocked(query).mockImplementation(async (sql: string) => ({ rows: sql.includes("FROM users") ? [{ ...employee, joining_date: null, login_ready: false }] : sql.includes("salary_structures") ? [{ id: 2, ctc_annual: 1800000 }] : [], rowCount: 1 }));
    const data = await (await setup(request(), context)).json();
    expect(data.canSetLogin).toBe(false); expect(data.canGeneratePayslip).toBe(true);
  });
  it("keeps HR-only setup data out of employee sessions", async () => {
    state.access.role = "employee";
    expect((await setup(request(), context)).status).toBe(403); expect(query).not.toHaveBeenCalled();
  });
  it("keeps a manager's setup view within their reporting team", async () => {
    state.access.role = "manager"; state.access.user_id = 99;
    expect((await setup(request(), context)).status).toBe(404);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("keeps the selected employee filter when a manager opens documents", async () => {
    await listEmployeeDocuments({ actorUserId: 1, role: "manager", employeeId: 12 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE u.reporting_manager_user_id = $1 AND d.user_id = $2"), [1, 12]);
  });
});
describe("feature switches", () => {
  it.each([["leave", "leave.view_self", "leave.apply_self"], ["attendance", "attendance.view_self", "attendance.manage_self"], ["timesheets", "timesheet.view_self", "timesheet.manage_self"]])("turning off %s also blocks self-service actions", (feature, view, action) => {
    expect(featurePermissionPatch(feature, false)).toEqual({ [view]: false, [action]: false });
    const effective = getEffectivePermissions("employee", new Map([[view, false], [action, true]]));
    expect(effective[view]).toBe(false); expect(effective[action]).toBe(false);
  });
  it("rejects direct actions after feature revocation, even with old action grants", async () => {
    state.access.role = "employee"; state.access.user_id = 12;
    state.access.permissions = getEffectivePermissions("employee", new Map([
      ["leave.view_self", false], ["leave.apply_self", true], ["attendance.view_self", false], ["attendance.manage_self", true],
      ["timesheet.view_self", false], ["timesheet.manage_self", true],
    ]));
    expect((await checkIn()).status).toBe(403);
    expect((await applyLeave(request())).status).toBe(403);
    expect((await saveTimesheet(request())).status).toBe(403);
    expect((await saveEntry(request())).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it("does not treat read-only timesheet access as permission to write or see company totals", async () => {
    state.access.role = "employee";
    state.access.permissions = { "timesheet.view_self": true };
    expect((await saveTimesheet(request())).status).toBe(403);
    expect((await saveEntry(request())).status).toBe(403);
    expect((await timesheetSummary(request())).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
});
