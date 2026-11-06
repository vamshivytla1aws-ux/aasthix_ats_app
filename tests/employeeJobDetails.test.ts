import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ pool: { connect: vi.fn() }, query: vi.fn() }));
vi.mock("@/lib/auditLog", () => ({ writeAuditLog: vi.fn() }));
import { query, pool } from "@/lib/db";
import { writeAuditLog } from "@/lib/auditLog";

const input = { employeeIdCode: "EMP-12", fullName: "Sample Employee", email: "employee@example.test", designation: "SDE II", department: "Engineering", status: "active" as const, role: "employee" };

beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

describe("employee job details storage", () => {
  it.each([{ email: "invalid" }, { role: "workspace_owner" }, { role: "admin" }, { joiningDate: "2026-02-30" }])("rejects invalid creation/import details before writing %j", async change => {
    const { createEmployee, importEmployees, validateImportRows } = await import("@/lib/hrms/employeeDirectory");
    const invalid = { ...input, ...change };
    await expect(createEmployee(invalid, 1)).rejects.toMatchObject({ code: "INVALID_EMPLOYEE_DETAILS" });
    await expect(importEmployees([invalid], 1)).rejects.toMatchObject({ code: "INVALID_EMPLOYEE_DETAILS" });
    expect(validateImportRows([{ ...invalid, rowNumber: 1 }])[0].status).toBe("invalid");
    expect(query).not.toHaveBeenCalled();
  });
  it.each(["department", "designation"])("refuses to silently drop a supplied %s when its column is missing", async missing => {
    vi.mocked(query).mockImplementation(async (sql: string, values?: any[]) => ({ rows: [], rowCount: sql.includes("information_schema.columns") && values?.[0] !== missing ? 1 : 0 }));
    const { updateEmployee, createEmployee, importEmployees } = await import("@/lib/hrms/employeeDirectory");
    await expect(updateEmployee(12, input, 1)).rejects.toMatchObject({ code: "EMPLOYEE_SCHEMA_OUTDATED" });
    await expect(createEmployee(input, 1)).rejects.toMatchObject({ code: "EMPLOYEE_SCHEMA_OUTDATED" });
    await expect(importEmployees([input], 1)).rejects.toMatchObject({ code: "EMPLOYEE_SCHEMA_OUTDATED" });
    expect(vi.mocked(query).mock.calls.every(([sql]) => sql.includes("information_schema.columns"))).toBe(true);
    expect(pool.connect).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("writes and reads a changed designation and permits clearing it", async () => {
    const record: Record<string, unknown> = { id: 12, ...input, full_name: input.fullName, department: "Old department", designation: "Old job title" };
    vi.mocked(query).mockImplementation(async (sql: string, values?: any[]) => {
      if (sql.includes("information_schema.columns")) return { rows: [{ exists: true }], rowCount: 1 };
      if (sql.includes("UPDATE users")) {
        for (const field of ["department", "designation"]) {
          const parameter = sql.match(new RegExp(`${field} = \\$(\\d+)`));
          if (parameter) record[field] = values?.[Number(parameter[1]) - 1];
        }
        return { rows: [], rowCount: 1 };
      }
      return { rows: [{ ...record }], rowCount: 1 };
    });
    const { updateEmployee, getEmployeeSelfProfile } = await import("@/lib/hrms/employeeDirectory");
    await updateEmployee(12, input, 1);
    expect(await getEmployeeSelfProfile(12)).toMatchObject({ department: "Engineering", designation: "SDE II" });
    await updateEmployee(12, { ...input, designation: "" }, 1);
    expect(await getEmployeeSelfProfile(12)).toMatchObject({ designation: null });
    expect(writeAuditLog).toHaveBeenCalledTimes(2);
  });
});
