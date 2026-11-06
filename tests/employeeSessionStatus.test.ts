import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/authServer", () => ({ requireAuthUser: vi.fn(async () => ({ user_id: 12, email: "employee@example.test", token_version: 2 })) }));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
import { query } from "@/lib/db";
import { getAuthAccess } from "@/lib/rbac";
const account = { id: 12, email: "employee@example.test", role: "employee", is_active: true, token_version: 2, access_scope: "own", employment_status: "active" };
beforeEach(() => { vi.clearAllMocks(); });
it.each(["inactive", "resigned"])("rejects an existing session after employee status becomes %s", async employment_status => {
  vi.mocked(query).mockResolvedValue({ rows: [{ ...account, employment_status }], rowCount: 1 });
  expect(await getAuthAccess()).toBeNull();
  expect(query).toHaveBeenCalledTimes(1);
});
it("retains employee defaults and permission revocations for an active session", async () => {
  vi.mocked(query).mockImplementation(async (sql: string) => ({ rows: sql.includes("FROM users") ? [account] : [{ permission_key: "salary.view", allowed: false }], rowCount: 1 }));
  const access = await getAuthAccess();
  expect(access?.permissions["employee_directory.view_self"]).toBe(true);
  expect(access?.permissions["salary.view"]).toBe(false);
  expect(access?.permissions["salary.manage"]).toBe(false);
});
