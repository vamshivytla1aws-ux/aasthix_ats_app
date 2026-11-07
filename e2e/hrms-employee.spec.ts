import { test, expect, type Page } from "@playwright/test";

const employee = { id: 12, full_name: "Sample Employee", email: "employee@example.test", role: "employee" };
const permissions = { "dashboard.view": true, "employee_directory.view_self": true, "salary.view": true,
  "documents.view_self": true, "attendance.view_self": true, "timesheet.view_self": true,
  "leave.view_self": false, "onboarding_exit.view_self": true, "performance.view_self": true };

test("directory Edit brings the selected employee form into view and saves changes", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([{ name: "ats_token", value: "mock", url: "http://127.0.0.1:3000" }]);
  let record = { ...employee, employee_code: "EMP-12", department: "Engineering", designation: "SDE I", employment_status: "active", joining_date: "2026-05-13" };
  let saved = false;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === "/api/auth/me") body = { user: { id: 1, full_name: "Sample HR", role: "hr" }, permissions: { "dashboard.view": true, "employee_directory.manage": true, "employee_directory.view_all": true } };
    else if (path === "/api/hrms/employees") body = { employees: [record] };
    else if (path === "/api/hrms/employees/12" && route.request().method() === "PATCH") {
      const values = route.request().postDataJSON();
      expect(values).toMatchObject({ fullName: employee.full_name, email: employee.email, department: "Product", joiningDate: "2026-05-13" });
      expect(["SDE II", "SDE III"]).toContain(values.designation);
      record = { ...record, department: values.department, designation: values.designation }; saved = true;
      body = { operation_status: "success" };
    }
    await route.fulfill({ json: body });
  });
  await page.goto("/hrms/employees");
  const row = page.getByRole("row").filter({ hasText: employee.email });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const name = page.getByPlaceholder("Full name", { exact: true });
  await expect(name).toBeFocused();
  await expect(name).toBeInViewport();
  await expect(name).toHaveValue(employee.full_name);
  await expect(page.getByPlaceholder("Email", { exact: true })).toHaveValue(employee.email);
  await page.getByLabel("Department", { exact: true }).fill("Product");
  await page.getByLabel("Designation / job title", { exact: true }).fill("SDE II");
  await expect(page.getByLabel("Employee code", { exact: true })).toHaveValue("EMP-12");
  await expect(page.getByLabel("Employment type", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Date of joining", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Employment status", { exact: true })).toHaveValue("active");
  await expect(page.getByLabel("Login role", { exact: true })).toHaveValue("employee");
  await page.getByRole("region", { name: "Employee details form" }).screenshot({ path: `test-results/hrms-employee-form-${page.viewportSize()?.width}.png` });
  await page.getByRole("button", { name: "Update employee", exact: true }).click();
  await expect(row.getByRole("cell", { name: "Product", exact: true })).toBeVisible();
  await expect(row.getByRole("cell", { name: "SDE II", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Employee details form" }).getByRole("status")).toHaveText(`Saved details for ${employee.full_name}.`);
  expect(saved).toBe(true);
  // Selecting the same record again must also return to the form.
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(name).toBeFocused();
  await expect(name).toBeInViewport();
  await expect(page.getByLabel("Designation / job title", { exact: true })).toHaveValue("SDE II");
  await page.reload();
  await expect(row.getByRole("cell", { name: "SDE II", exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(name).toBeFocused();
  await expect(name).toBeInViewport();
  await row.getByRole("link", { name: "View 360", exact: true }).click();
  await expect(page.getByText("SDE II · Product · EMP-12", { exact: true })).toBeVisible();
  const editor = page.getByRole("region", { name: "Manage employee profile", exact: true });
  await editor.getByRole("button", { name: "Edit employee", exact: true }).click();
  await editor.getByLabel("Designation", { exact: true }).fill("SDE III");
  await editor.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByText("SDE III · Product · EMP-12", { exact: true })).toBeVisible();
  await page.goto("/hrms/employees");
  await expect(row.getByRole("cell", { name: "SDE III", exact: true })).toBeVisible();
});

test("a failed employee save keeps the draft and shows the actual error beside the fields", async ({ page, context }) => {
  await context.addCookies([{ name: "ats_token", value: "mock", url: "http://127.0.0.1:3000" }]);
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { user: { id: 1, role: "hr" }, permissions: { "employee_directory.manage": true, "employee_directory.view_all": true } } });
    if (path === "/api/hrms/employees") return route.fulfill({ json: { employees: [employee] } });
    if (route.request().method() === "PATCH") return route.fulfill({ status: 503, json: { operation_status: "error", user_message: "Cannot save designation: the employee profile update has not been applied." } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/hrms/employees");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const form = page.getByRole("region", { name: "Employee details form", exact: true });
  await form.getByLabel("Designation / job title", { exact: true }).fill("SDE II");
  await form.getByRole("button", { name: "Update employee", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("Cannot save designation");
  await expect(form.getByLabel("Designation / job title", { exact: true })).toHaveValue("SDE II");
  await expect(form.getByRole("button", { name: "Update employee", exact: true })).toBeEnabled();
  await expect(form.getByRole("status")).toHaveCount(0);
});

test("read-only HR cannot see editing actions and a failed directory load can be retried", async ({ page, context }) => {
  await context.addCookies([{ name: "ats_token", value: "mock", url: "http://127.0.0.1:3000" }]);
  let failed = true;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") return route.fulfill({ json: { user: { id: 1, role: "hr" }, permissions: { "employee_directory.view_all": true } } });
    if (path === "/api/hrms/employees") return failed ? route.fulfill({ status: 500, json: { error: "Read failed" } }) : route.fulfill({ json: { employees: [employee] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/hrms/employees");
  await expect(page.getByRole("alert").filter({ hasText: "Unable to load the employee directory" })).toBeVisible();
  await expect(page.getByText("No employees found.", { exact: true })).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("link", { name: employee.full_name, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Employee details form" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Deactivate", exact: true })).toHaveCount(0);
});

test("employee without a saved salary sees guidance instead of an endless loading message", async ({ page, context }) => {
  await context.addCookies([{ name: "ats_token", value: "mock", url: "http://127.0.0.1:3000" }]);
  await fixtures(page);
  await page.route("**/api/salary-structures/12?*", route => route.fulfill({ status: 404, json: { error: "Salary structure not found" } }));
  await page.goto("/salary");
  await expect(page.getByText("No salary setup applies to the current month.", { exact: true })).toBeVisible();
  await expect(page.getByText("Loading salary details…", { exact: true })).toHaveCount(0);
});

async function fixtures(page: Page, overrides: Record<string, boolean> = {}) {
  const requests: string[] = [];
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    let body: unknown = {};
    const headers: Record<string, string> = {};
    if (path === "/api/auth/config") body = { allowOpenSignup: false };
    else if (path === "/api/auth/me") body = { user: employee, permissions: { ...permissions, ...overrides } };
    else if (path === "/api/auth/login") {
      expect(route.request().postDataJSON()).toMatchObject({ email: employee.email, password: "test-password", portal: "employee" });
      headers["set-cookie"] = "ats_token=mock-ui-test-only; Path=/; SameSite=Lax";
      body = { user: employee };
    } else if (path === "/api/hrms/profile/me") body = { profile: { ...employee, employee_code: "EMP-12", designation: "SDE II", department: "Engineering", reporting_manager_name: "Sample Manager", work_location: "Bangalore" } };
    else if (path === "/api/salary-structures/12") body = { structure: { ctc_annual: 1800000, mode: "Reviewed package", effective_from: "2026-05-01",
      pan: "••••234F", bank_account_number: "••••5678", uan_number: "••••9012", pf_number: "••••" },
      components: [{ key: "basic", type: "earning", name: "Basic Salary", monthly: 45000 }] };
    else if (path === "/api/payslips/12") body = { payslips: [{ id: 101, month: 5, year: 2026, paid_days: 13, net_salary: 60598, gross_monthly: 67230.94 }] };
    else if (path === "/api/payslips/annual") body = { financial_years: [], statement: null };
    else if (path === "/api/hrms/documents") body = { documents: [{ id: 201, user_id: 12, file_name: "Offer letter.pdf", category: "offer_letter" }] };
    else if (path === "/api/hrms/onboarding-exit") body = { workflows: [{ id: 1, user_id: 12, workflow_type: "onboarding", status: "in_progress", checklist: { document_collection: true } }] };
    else if (path === "/api/hrms/performance") body = { goals: [{ id: 1, employee_id: 12, title: "Complete onboarding", description: "Complete induction" }], reviews: [] };
    await route.fulfill({ json: body, headers });
  });
  return requests;
}

for (const width of [1440, 390]) {
  test(`employee signs in to a permitted HRMS at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const requests = await fixtures(page);
    await page.goto("/employee/login?next=/pipeline");
    await expect(page.getByRole("heading", { name: "Employee HRMS sign in" })).toBeVisible();
    await expect(page.getByText("Make every hiring decision with clarity.")).not.toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill(employee.email);
    await page.getByLabel("Password", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL("**/hrms");
    await expect(page.getByRole("heading", { name: "My HRMS", exact: true })).toBeVisible();
    await expect(page.getByText("Sample Manager", { exact: false })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Employee navigation" });
    await expect(nav.getByRole("link", { name: "My Payslips" })).toBeVisible();
    await expect(page.getByRole("link", { name: "My Leave", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Candidates", exact: true })).toHaveCount(0);
    expect(requests).not.toContain("/api/hrms/summary");
    expect(requests).not.toContain("/api/leave/dashboard/me");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `test-results/hrms-employee-${width}.png`, fullPage: true });
    await nav.getByRole("link", { name: "My Payslips", exact: true }).click();
    await expect(page.getByRole("heading", { name: "My salary breakup" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("••••5678", { exact: true })).toBeVisible();
    await expect(page.getByText("12345678", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Basic Salary", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "PDF", exact: true })).toHaveAttribute("href", "/api/payslips/101/download");
    await nav.getByRole("link", { name: "My Documents", exact: true }).click();
    await expect(page.getByText("Offer letter.pdf", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download", exact: true })).toHaveAttribute("href", "/api/hrms/documents/201");
    await page.goto("/hrms/my-records");
    await expect(page.getByText("Complete onboarding", { exact: true })).toBeVisible();
    await expect(page.getByText("document collection", { exact: false })).toBeVisible();
    await page.goto("/hrms/employees/99");
    await expect(page.getByRole("heading", { name: "This area is not available with your employee access." })).toBeVisible();
    expect(requests).not.toContain("/api/hrms/employees");
  });
}

test("revoked pay access hides pay and blocks the direct page", async ({ page, context }) => {
  await context.addCookies([{ name: "ats_token", value: "mock", url: "http://127.0.0.1:3000" }]);
  const requests = await fixtures(page, { "salary.view": false });
  await page.goto("/salary");
  await expect(page.getByRole("heading", { name: "This area is not available with your employee access." })).toBeVisible();
  await expect(page.getByRole("link", { name: "My Payslips" })).toHaveCount(0);
  expect(requests).not.toContain("/api/payslips/12");
  expect(requests).not.toContain("/api/salary-structures/12");
});

test("HR home keeps the common tasks visible and more tools collapsed", async ({ page, context }) => {
  await context.addCookies([{ name: "ats_token", value: "mock", url: "http://127.0.0.1:3000" }]);
  await page.route("**/api/**", route => route.fulfill({ json: new URL(route.request().url()).pathname === "/api/auth/me" ? {
    user: { id: 1, full_name: "Sample HR", role: "hr" }, permissions: { "dashboard.view": true, "employee_directory.manage": true, "employee_directory.view_all": true, "salary.manage": true, "payroll.run": true, "leave.view_self": true, "attendance.view_all": true, "documents.view_all": true },
  } : {} }));
  await page.goto("/hrms");
  await expect(page.getByRole("link", { name: "Employees & Payslips", exact: false })).toBeVisible();
  await expect(page.getByText("Payroll approvals", { exact: true })).not.toBeVisible();
  await expect(page.getByText("Schema diagnostics", { exact: true })).not.toBeVisible();
  await page.getByRole("link", { name: "Employees & Payslips", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Employee Directory", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add employee", exact: true })).toBeVisible();
  await page.goto("/hrms/documents");
  await expect(page.getByRole("heading", { name: "Document Management", exact: true })).toBeVisible();
});

test("HR sets employee login from the employee record", async ({ page, context }) => {
  await context.addCookies([{ name: "ats_token", value: "mock", url: "http://127.0.0.1:3000" }]);
  let ready = false;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === "/api/auth/me") body = { user: { id: 1, full_name: "Sample HR", role: "hr" }, permissions: { "dashboard.view": true, "employee_directory.manage": true, "employee_directory.view_all": true, "salary.view": true } };
    else if (path === "/api/hrms/employees" || path === "/api/salary-structures") body = { employees: [employee] };
    else if (path === "/api/hrms/employees/12/setup") body = { items: [], canManageAccess: false,
      features: [{ id: "profile", label: "Profile", enabled: true }, { id: "leave", label: "Leave", enabled: false }] };
    else if (path === "/api/hrms/employees/12/login") {
      if (route.request().method() === "POST") {
        expect(route.request().postDataJSON()).toEqual({ joiningDate: "2026-05-13" });
        ready = true; body = { ok: true };
      } else body = { email: employee.email, loginReady: ready, active: true, loginPath: "/employee/login", joiningDate: ready ? "2026-05-13" : null };
    }
    await route.fulfill({ json: body });
  });
  await page.goto("/hrms/employees/12");
  await page.getByRole("navigation", { name: "Employee profile sections" }).getByRole("button", { name: "Login & Access", exact: true }).click();
  const preview = page.getByRole("region", { name: "Employee access preview", exact: true });
  await expect(preview).toContainText("Profile · Visible");
  await expect(preview).toContainText("Leave · Hidden");
  await expect(page.getByRole("checkbox", { name: "Profile access", exact: true })).toBeDisabled();
  await expect(page.getByText("Password not set", { exact: false })).toBeVisible();
  await page.getByLabel("Date of joining", { exact: true }).fill("2026-05-13");
  await page.getByRole("button", { name: "Set joining date password", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Password saved");
  await expect(page.getByLabel("Date of joining", { exact: true })).toHaveValue("2026-05-13");
  await expect(page.getByRole("button", { name: "Reset password to joining date", exact: true })).toBeVisible();
  await expect(page.getByText("Ready to sign in", { exact: false })).toBeVisible();
  expect(ready).toBe(true);
});

test("HR edits, clears, deactivates and reactivates an employee profile", async ({ page, context }) => {
  await context.addCookies([{ name: "ats_token", value: "mock", url: "http://127.0.0.1:3000" }]);
  let record = { ...employee, employee_code: "EMP-12", phone: "9999999999", department: "Engineering", designation: "SDE II", joining_date: "2026-05-13", employment_status: "active" };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === "/api/auth/me") body = { user: { id: 1, full_name: "Sample HR", role: "hr" }, permissions: { "dashboard.view": true, "employee_directory.manage": true, "employee_directory.view_all": true, "salary.view": true, "documents.view_all": true } };
    else if (path === "/api/hrms/employees" || path === "/api/salary-structures") body = { employees: [record] };
    else if (path === "/api/hrms/employees/12/login") body = { email: record.email, loginReady: true, joiningDate: record.joining_date, active: record.employment_status === "active", loginPath: "/employee/login" };
    else if (path === "/api/hrms/employees/12") {
      if (route.request().method() === "PATCH") {
        const values = route.request().postDataJSON();
        record = { ...record, full_name: values.fullName, email: values.email, phone: values.phone, employee_code: values.employeeIdCode, department: values.department, designation: values.designation, joining_date: values.joiningDate, employment_status: values.status };
      } else if (route.request().method() === "DELETE") record = { ...record, employment_status: "inactive" };
      body = { operation_status: "success" };
    } else if (path === "/api/payslips/12") body = { payslips: [{ id: 101, month: 5, year: 2026, paid_days: 13, gross_monthly: 67230.94, net_salary: 60598 }] };
    await route.fulfill({ json: body });
  });
  await page.goto("/hrms/employees/12");
  const editor = page.getByRole("region", { name: "Manage employee profile", exact: true });
  await editor.getByRole("button", { name: "Edit employee", exact: true }).click();
  await editor.getByLabel("Department", { exact: true }).fill("Product");
  await editor.getByLabel("Phone", { exact: true }).fill("");
  await editor.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Employee profile updated");
  expect(record.department).toBe("Product"); expect(record.phone).toBe("");
  await expect(editor.getByRole("link", { name: "Manage documents" })).toHaveAttribute("href", "/hrms/documents?employeeId=12");
  page.once("dialog", dialog => dialog.accept());
  await editor.getByRole("button", { name: "Deactivate employee", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("history retained");
  expect(record.employment_status).toBe("inactive");
  const sections = page.getByRole("navigation", { name: "Employee profile sections" });
  await sections.getByRole("button", { name: "Salary & Payslips", exact: true }).click();
  await expect(page.getByRole("link", { name: "PDF", exact: true })).toHaveCount(1);
  await sections.getByRole("button", { name: "Details", exact: true }).click();
  await editor.getByRole("button", { name: "Edit employee", exact: true }).click();
  await editor.getByRole("combobox", { name: "Employment status", exact: true }).selectOption("active");
  await editor.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Employee profile updated");
  expect(record.employment_status).toBe("active");
  await editor.getByRole("button", { name: "Edit employee", exact: true }).click();
  await editor.getByRole("button", { name: "Clear optional details", exact: true }).click();
  await expect(editor.getByLabel("Full name", { exact: true })).toHaveValue(employee.full_name);
  await expect(editor.getByLabel("Email", { exact: true })).toHaveValue(employee.email);
  await expect(editor.getByLabel("Date of joining", { exact: true })).toHaveValue("");
  await editor.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(editor.getByRole("status")).toContainText("Employee profile updated");
  expect(record.department).toBe("");
});
