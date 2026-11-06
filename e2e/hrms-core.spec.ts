import { test, expect, type Page } from "@playwright/test";
import { EMPLOYEE_FEATURES } from "../lib/hrms/employeeFeatures";

async function mockWorkspace(page: Page, owner: boolean, salarySaved = true) {
  let features = EMPLOYEE_FEATURES.map(feature => ({ id: feature.id, label: feature.label, enabled: true }));
  const updates: unknown[] = [];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    let body: unknown = {};
    if (path === "/api/auth/me") body = { user: { id: 1, full_name: "Sample HR", role: owner ? "workspace_owner" : "hr" }, permissions: {
      "employee_directory.view_all": true, "employee_directory.manage": true, "salary.view": true, "salary.manage": true,
      "documents.view_all": true, "documents.manage": true, "attendance.view_all": true, "attendance.manage_all": true, "leave.approve_team": true,
    } };
    else if (path === "/api/hrms/employees") body = { employees: [{ id: 12, role: "employee", full_name: "Sample Employee", email: "employee@example.test", department: "Engineering", joining_date: "2026-05-13", employment_status: "active" }] };
    else if (path.endsWith("/setup")) body = { employeeId: 12, canManageAccess: owner, features, items: [
      { key: "details", label: "Profile details", status: "complete", detail: "Name and email are required." },
      { key: "login", label: "Employee login", status: "needs_attention", detail: "Set the joining-date password." },
      { key: "salary", label: "Salary setup", status: salarySaved ? "complete" : "needs_attention", detail: "Save a salary structure before generating a payslip." },
      { key: "documents", label: "Documents", status: "optional", detail: "No configured mandatory documents are missing." },
    ] };
    else if (path.endsWith("/login")) body = { email: "employee@example.test", loginReady: false, active: true, loginPath: "/employee/login", joiningDate: "2026-05-13" };
    else if (path === "/api/salary-structures/12") body = { structure: salarySaved ? { ctc_annual: 1800000 } : null };
    else if (path === "/api/payslips/12") body = { payslips: [] };
    else if (path === "/api/hrms/documents") body = { documents: [] };
    else if (path === "/api/admin/users-permissions") {
      const update = route.request().postDataJSON(); updates.push(update);
      features = features.map(feature => ({ ...feature, enabled: update.permissions[EMPLOYEE_FEATURES.find(item => item.id === feature.id)!.view] ?? feature.enabled }));
      body = { ok: true };
    } else if (path.endsWith("/monthly-records")) {
      const month = url.searchParams.get("month");
      body = { month, attendance: { available: true, totals: { present: month === "2026-05" ? 1 : 0, late: 0, absent: 0, notRecorded: month === "2026-05" ? 30 : 31 }, entries: [
        { date: `${month}-01`, status: "not_recorded", firstCheckIn: null, lastCheckOut: null, minutes: 0 },
        ...(month === "2026-05" ? [{ date: "2026-05-14", status: "present", firstCheckIn: "2026-05-14T04:00:00Z", lastCheckOut: "2026-05-14T12:00:00Z", minutes: 480 }] : []),
      ] }, leave: { available: true, requests: month === "2026-05" ? [{ id: 4, from_date: "2026-04-29", to_date: "2026-05-02", leave_type: "casual", status: "approved", paid_days: 4, lop_days: 0 }] : [] }, links: { attendance: `/attendance?user_id=12&date=${month}-01`, leave: `/leave?user_id=12&month=${month}` } };
    }
    await route.fulfill({ json: body });
  });
  return updates;
}

for (const width of [1440, 390]) {
  test(`employee profile core flow at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: "ats_token", value: "mock", url: "http://127.0.0.1:3000" }]);
    const updates = await mockWorkspace(page, true);
    await page.goto("/hrms/employees/12");
    const checklist = page.getByRole("region", { name: "Employee setup checklist" });
    await expect(checklist.getByRole("button", { name: "Open Profile details" })).toContainText("Complete");
    await checklist.getByRole("button", { name: "Open Employee login" }).click();
    await expect(page.getByRole("button", { name: "Set joining date password", exact: true })).toBeVisible();
    const access = page.getByRole("region", { name: "Employee feature access" });
    await expect(access.getByRole("checkbox")).toHaveCount(8);
    await access.getByRole("checkbox", { name: "Leave access", exact: true }).uncheck();
    await expect(access.getByRole("checkbox", { name: "Leave access", exact: true })).not.toBeChecked();
    expect(updates).toEqual([{ user_id: 12, permissions: { "leave.view_self": false, "leave.apply_self": false } }]);
    await checklist.getByRole("button", { name: "Open Salary setup" }).click();
    await expect(page.getByRole("button", { name: "Generate payslip", exact: true })).toBeEnabled();
    await page.getByText("Salary setup and employee details", { exact: true }).click();
    await expect(page.getByLabel("Department", { exact: true })).not.toBeVisible();
    await expect(page.getByLabel("Date of joining", { exact: true })).not.toBeVisible();
    await page.getByRole("navigation", { name: "Employee profile sections" }).getByRole("button", { name: "Attendance & Leave", exact: true }).click();
    await page.getByLabel("Records month", { exact: true }).fill("2026-05");
    await expect(page.getByText("Recorded absent:", { exact: false })).toHaveText("Recorded absent: 0");
    await expect(page.getByRole("cell", { name: "not recorded", exact: true })).toBeVisible();
    await expect(page.getByText("2026-04-29 to 2026-05-02", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage attendance for this employee" })).toHaveAttribute("href", "/attendance?user_id=12&date=2026-05-01");
    await expect(page.getByRole("link", { name: "Manage leave for this employee" })).toHaveAttribute("href", "/leave?user_id=12&month=2026-05");
    await page.screenshot({ path: `test-results/hrms-core-records-${width}.png`, fullPage: true });
    await page.getByLabel("Records month", { exact: true }).fill("2026-07");
    await expect(page.getByText("No leave requests for this month.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test("HR can inspect access but only the owner can change it; unsaved salary blocks generation", async ({ page, context }) => {
  await context.addCookies([{ name: "ats_token", value: "mock", url: "http://127.0.0.1:3000" }]);
  const updates = await mockWorkspace(page, false, false);
  await page.goto("/hrms/employees/12?tab=login");
  const access = page.getByRole("region", { name: "Employee feature access" });
  await expect(access.getByRole("checkbox")).toHaveCount(8);
  for (const checkbox of await access.getByRole("checkbox").all()) await expect(checkbox).toBeDisabled();
  await page.getByRole("navigation", { name: "Employee profile sections" }).getByRole("button", { name: "Salary & Payslips", exact: true }).click();
  await expect(page.getByRole("button", { name: "Generate payslip", exact: true })).toBeDisabled();
  expect(updates).toEqual([]);
});
