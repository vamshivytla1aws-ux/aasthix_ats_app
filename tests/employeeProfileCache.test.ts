import { describe, expect, it } from "vitest";
import { isEmployeeProfileCache } from "@/lib/hrms/employeeProfileCache";
import { apiFetchJson } from "@/lib/apiClient";
import { vi } from "vitest";

describe("saved employee refresh and feedback", () => {
  it("refreshes directory filters, profile and self service without fetching unrelated records", () => {
    for (const key of ["/api/hrms/employees", "/api/hrms/employees?", "/api/hrms/employees?q=Sample", "/api/hrms/profile/me", "/api/hrms/employees/12/setup", "/api/hrms/employees/12/login"]) expect(isEmployeeProfileCache(key, 12)).toBe(true);
    for (const key of [null, ["other"], "/api/hrms/employees/99/setup", "/api/hrms/employees/12/monthly-records?month=2026-05", "/api/payslips/12"]) expect(isEmployeeProfileCache(key, 12)).toBe(false);
  });
  it("shows an employee save failure's user-facing message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ operation_status: "error", user_message: "Cannot save designation: the employee profile update has not been applied." }), { status: 503, headers: { "Content-Type": "application/json" } })));
    try { await expect(apiFetchJson("http://localhost/test")).rejects.toThrow("Cannot save designation"); }
    finally { vi.unstubAllGlobals(); }
  });
});
