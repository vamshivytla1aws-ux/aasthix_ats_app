import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/rbac", () => ({ requirePermission: vi.fn(async () => ({ ok: true, access: { user_id: 1, role: "hr" } })) }));
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hashed-password") } }));
vi.mock("@/lib/auditLog", () => ({ writeAuditLog: vi.fn() }));
import { GET, POST } from "@/app/api/hrms/employees/[id]/login/route";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/auditLog";
import bcrypt from "bcryptjs";
const params = { params: { id: "12" } };
const request = (joiningDate = "2026-05-13") => new Request("http://localhost/test", { method: "POST", body: JSON.stringify({ joiningDate }) });
const account = { id: 12, role: "employee", email: "employee@example.test", is_active: true, employment_status: "active", login_ready: false, joining_date: null };
describe("HR configures employee login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePermission).mockResolvedValue({ ok: true, access: { user_id: 1, role: "hr" } } as any);
    vi.mocked(query).mockImplementation(async (sql: string) => ({ rows: sql.startsWith("UPDATE") ? [{ id: 12 }] : [account], rowCount: 1 }));
  });
  it("returns login status without password data", async () => {
    const data = await (await GET(request(), params)).json();
    expect(data).toEqual({ email: account.email, loginReady: false, active: true, loginPath: "/employee/login", joiningDate: null });
  });
  it("hashes the password, invalidates sessions and audits without logging the password", async () => {
    expect((await POST(request(), params)).status).toBe(200);
    expect(bcrypt.hash).toHaveBeenCalledWith("13052026", 12);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("token_version = COALESCE(token_version, 1) + 1"), ["hashed-password", 12, "2026-05-13"]);
    expect(JSON.stringify(vi.mocked(writeAuditLog).mock.calls)).not.toContain("13052026");
  });
  it("cannot reset a staff account through employee setup", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [{ ...account, role: "admin" }], rowCount: 1 });
    expect((await POST(request(), params)).status).toBe(403);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("rejects requests without HR management access", async () => {
    vi.mocked(requirePermission).mockResolvedValue({ ok: false, status: 403, error: "Forbidden" } as any);
    expect((await POST(request(), params)).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
  it("rejects an invalid date of joining", async () => {
    expect((await POST(request("1990-02-30"), params)).status).toBe(400);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("requires a joining date when none has been saved", async () => {
    const response = await POST(new Request("http://localhost/test", { method: "POST", body: "{}" }), params);
    expect(response.status).toBe(400);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("can reset using the saved date of joining", async () => {
    vi.mocked(query).mockImplementation(async (sql: string) => ({ rows: sql.startsWith("UPDATE") ? [{ id: 12 }] : [{ ...account, joining_date: "2026-05-13" }], rowCount: 1 }));
    expect((await POST(new Request("http://localhost/test", { method: "POST", body: "{}" }), params)).status).toBe(200);
    expect(bcrypt.hash).toHaveBeenCalledWith("13052026", 12);
  });
});
