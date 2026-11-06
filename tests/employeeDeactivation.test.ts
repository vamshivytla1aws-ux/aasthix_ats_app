import { expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ pool: {}, query: vi.fn(async () => ({ rows: [], rowCount: 1 })) }));
vi.mock("@/lib/auditLog", () => ({ writeAuditLog: vi.fn() }));
import { query } from "@/lib/db";
import { deactivateEmployee } from "@/lib/hrms/employeeDirectory";
it("blocks login and revokes existing sessions without deleting historical records", async () => {
  await deactivateEmployee(12, 1);
  expect(query).toHaveBeenCalledTimes(1);
  expect(query).toHaveBeenCalledWith(expect.stringContaining("is_active = false, token_version = COALESCE(token_version, 1) + 1"), [12]);
  expect(vi.mocked(query).mock.calls[0][0]).not.toMatch(/DELETE|payslips|attendance_records/i);
});
