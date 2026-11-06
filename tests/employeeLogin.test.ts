import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn(async () => true) } }));
vi.mock("@/lib/auth", () => ({ signAuthToken: vi.fn(async () => "signed-test-token"), tokenCookieName: () => "ats_token" }));
vi.mock("@/lib/auditLog", () => ({ writeAuditLog: vi.fn() }));
import { POST } from "@/app/api/auth/login/route";
import { query } from "@/lib/db";
import bcrypt from "bcryptjs";
import { signAuthToken } from "@/lib/auth";
const request = (extra = {}) => new Request("http://localhost/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "employee@example.test", password: "example-password", portal: "employee", ...extra }) });
const account = { id: 12, email: "employee@example.test", full_name: "Test Employee", password_hash: "hash", role: "employee", is_active: true, token_version: 2, employment_status: "active" };
describe("employee login", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(query).mockResolvedValue({ rows: [account], rowCount: 1 }); vi.mocked(bcrypt.compare).mockResolvedValue(true as never); });
  it("authenticates an active employee with the existing secure session cookie", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(signAuthToken).toHaveBeenCalledWith({ user_id: 12, email: account.email, token_version: 2 });
  });
  it("does not sign a staff account into the employee portal", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [{ ...account, role: "hr" }], rowCount: 1 });
    expect((await POST(request())).status).toBe(403);
    expect(signAuthToken).not.toHaveBeenCalled();
  });
  it.each(["inactive", "resigned"])("blocks %s employees", async employment_status => {
    vi.mocked(query).mockResolvedValue({ rows: [{ ...account, employment_status }], rowCount: 1 });
    expect((await POST(request())).status).toBe(403);
    expect(signAuthToken).not.toHaveBeenCalled();
  });
  it("keeps password checks in place", async () => {
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);
    expect((await POST(request())).status).toBe(401);
    expect(signAuthToken).not.toHaveBeenCalled();
  });
  it("sends employee form redirects to HRMS", async () => {
    const response = await POST(request({ redirect_to: "/pipeline" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/hrms");
  });
  it("retains the regular staff login and rejects external redirect URLs", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [{ ...account, role: "hr" }], rowCount: 1 });
    const response = await POST(request({ portal: undefined, redirect_to: "//outside.example" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
