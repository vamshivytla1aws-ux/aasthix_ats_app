import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ access: { user_id: 12, email: "employee@example.test", role: "employee", access_scope: "own", permissions: { "salary.view": true, "dashboard.view": true, "documents.view_self": true } as Record<string, boolean> } }));
vi.mock("@/lib/rbac", () => ({ getAuthAccess: vi.fn(async () => state.access), requirePermission: vi.fn(async (key: string) => state.access.permissions[key] ? { ok: true, access: state.access } : { ok: false, status: 403, error: "Forbidden" }) }));
vi.mock("@/lib/db", () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })) }));
vi.mock("@/lib/auditLog", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/attendance", () => ({ getTodayAttendanceForUser: vi.fn(async () => ({ today: "2026-11-06", settings: {}, record: null })), getAttendanceRecentForUser: vi.fn(async () => []), getAttendanceSummary: vi.fn() }));

import { query } from "@/lib/db";
import { GET as salaryStructure } from "@/app/api/salary-structures/[employeeId]/route";
import { GET as salaryEmployees } from "@/app/api/salary-structures/route";
import { GET as hrSummary } from "@/app/api/hrms/summary/route";
import { GET as documentDownload } from "@/app/api/hrms/documents/[id]/route";
import { listPerformanceGoals } from "@/lib/hrms/performance";
import { employeeModules, canOpenEmployeePage } from "@/lib/hrms/selfService";
import { resolveDefaultLandingPath } from "@/lib/defaultLandingPath";
import { GET as attendanceMe } from "@/app/api/attendance/me/route";
import { getAttendanceSummary, getTodayAttendanceForUser } from "@/lib/attendance";
import { GET as payslipList } from "@/app/api/payslips/[id]/route";
import { GET as payslipData } from "@/app/api/payslips/[id]/data/route";
import { GET as payslipDownload } from "@/app/api/payslips/[id]/download/route";
import { GET as annualPayslips } from "@/app/api/payslips/annual/route";
import { POST as createEmployee } from "@/app/api/hrms/employees/route";
import { POST as importEmployees } from "@/app/api/hrms/employees/import-csv/commit/route";
import { POST as saveSalary } from "@/app/api/salary-structures/route";
import { POST as calculateSalary } from "@/app/api/salary-structures/calculate/route";
import { POST as generatePayslip } from "@/app/api/payslips/generate/route";
import { DELETE as deletePayslip } from "@/app/api/payslips/[id]/route";
import { POST as uploadDocument } from "@/app/api/hrms/documents/route";
import { DELETE as deleteDocument } from "@/app/api/hrms/documents/[id]/route";

const request = new Request("http://localhost/test");
describe("employee HRMS access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.access.permissions = { "salary.view": true, "dashboard.view": true, "documents.view_self": true };
    vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 });
  });
  it("sends employees and HR to HRMS after login", () => {
    expect(resolveDefaultLandingPath("employee", {})).toBe("/hrms");
    expect(resolveDefaultLandingPath("hr", {})).toBe("/hrms");
    expect(resolveDefaultLandingPath("admin", {})).toBe("/dashboard");
  });
  it("shows only explicitly permitted employee modules", () => {
    const modules = employeeModules({ "salary.view": true, "documents.view_self": false });
    expect(modules.map(item => item.href)).toEqual(["/salary"]);
    expect(canOpenEmployeePage("/hrms/employees/99", state.access.permissions)).toBe(false);
    expect(canOpenEmployeePage("/salary", { "salary.view": false })).toBe(false);
  });
  it("blocks another employee's salary setup before loading it", async () => {
    expect((await salaryStructure(request, { params: { employeeId: "99" } })).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it("loads only this employee in salary employee lists", async () => {
    expect((await salaryEmployees()).status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE id = $1"), [12]);
  });
  it("honors a revoked salary permission", async () => {
    state.access.permissions["salary.view"] = false;
    expect((await salaryStructure(request, { params: { employeeId: "12" } })).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it("keeps HR-wide summary data out of employee sessions", async () => {
    expect((await hrSummary()).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it("prevents downloading another employee's document", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [{ id: 1, user_id: 99, file_blob: Buffer.from("private") }], rowCount: 1 });
    const response = await documentDownload(request, { params: Promise.resolve({ id: "1" }) });
    expect(response.status).toBe(403);
  });
  it("honors revoked document access even for an owned document", async () => {
    state.access.permissions["documents.view_self"] = false;
    vi.mocked(query).mockResolvedValue({ rows: [{ id: 1, user_id: 12, file_blob: Buffer.from("private") }], rowCount: 1 });
    expect((await documentDownload(request, { params: Promise.resolve({ id: "1" }) })).status).toBe(403);
  });
  it("scopes performance goals in the database", async () => {
    await listPerformanceGoals(3, { role: "employee", actorUserId: 12 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("g.employee_id = $2"), [3, 12]);
  });
  it("does not include company-wide attendance in a self-service request", async () => {
    state.access.permissions["attendance.view_self"] = true;
    expect((await attendanceMe()).status).toBe(200);
    expect(getTodayAttendanceForUser).toHaveBeenCalledWith(12);
    expect(getAttendanceSummary).not.toHaveBeenCalled();
  });
  it("blocks other employee payslip lists and yearly statements", async () => {
    expect((await payslipList(request, { params: { id: "99" } })).status).toBe(403);
    expect((await annualPayslips(new Request("http://localhost/api/payslips/annual?employee_id=99"))).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it("blocks another employee's payslip details and PDF", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [{ id: 1, employee_id: 99 }], rowCount: 1 });
    expect((await payslipData(request, { params: { id: "1" } })).status).toBe(403);
    expect((await payslipDownload(request, { params: { id: "1" } })).status).toBe(403);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("keeps employee sessions read-only for HR-managed data even with an old management grant", async () => {
    state.access.permissions = { "employee_directory.manage": true, "salary.manage": true, "documents.manage": true };
    for (const action of [createEmployee, importEmployees, saveSalary, calculateSalary, generatePayslip, uploadDocument]) expect((await action(request)).status).toBe(403);
    expect((await deletePayslip(request, { params: { id: "1" } })).status).toBe(403);
    expect((await deleteDocument(request, { params: Promise.resolve({ id: "1" }) })).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
});
