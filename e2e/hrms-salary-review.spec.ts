import { expect, test } from "@playwright/test";
import { estimatePackage } from "../lib/salary/packageReview";

const employee = { id: 12, full_name: "Sample Employee", email: "employee@example.test", role: "employee" };

test("HR reviews an annual package before the effective month can use it", async ({ page, context }) => {
  await context.addCookies([{ name: "ats_token", value: "mock", url: "http://127.0.0.1:3000" }]);
  await page.clock.setFixedTime(new Date("2026-11-07T06:00:00Z"));
  let saved: Record<string, unknown> | null = null;
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    switch (url.pathname) {
      case "/api/auth/me": return route.fulfill({ json: { user: { id: 1, role: "workspace_owner" },
        permissions: { "employee_directory.view_all": true, "salary.view": true, "salary.manage": true } } });
      case "/api/hrms/employees": return route.fulfill({ json: { employees: [employee] } });
      case "/api/payslips/12": return route.fulfill({ json: { payslips: [] } });
      case "/api/salary-structures/12":
        return saved && url.searchParams.get("month") !== "2026-10" ? route.fulfill({ json: { structure: saved } })
          : route.fulfill({ status: 404, json: { error: "Salary structure not found" } });
      case "/api/salary-structures/calculate": {
        const input = route.request().postDataJSON();
        expect(input).toMatchObject({ packageEstimate: true, salaryMonth: "2026-11", ctcAnnual: 1800000 });
        return route.fulfill({ json: { estimate: estimatePackage(input.ctcAnnual, input.packageReview), financialYear: "FY 2026-27", suggestedTds: null } });
      }
      case "/api/salary-structures": {
        const input = route.request().postDataJSON();
        expect(input).toMatchObject({ confirmPackage: true, salaryMonth: "2026-11-01",
          packageReview: { employerPfInCtc: true, employerPf: 1800, employeePf: 0, professionalTax: 0, tds: 0 } });
        saved = { ctc_annual: input.ctcAnnual, package_review: input.packageReview, effective_from: input.salaryMonth };
        return route.fulfill({ json: { ok: true } });
      }
      default: return route.fulfill({ json: {} });
    }
  });
  await page.goto("/hrms/employees/12?tab=salary");
  await expect(page.getByText("Not saved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate payslip", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Review annual package", exact: true }).click();
  const panel = page.getByRole("region", { name: "Review annual package", exact: true });
  await panel.getByLabel("Annual CTC (₹)", { exact: true }).fill("1800000");
  await panel.getByRole("button", { name: "Preview breakup", exact: true }).click();
  await expect(panel.getByText("The suggested earnings below", { exact: false })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Save reviewed package", exact: true })).toBeDisabled();
  await panel.getByRole("combobox", { name: "Employer PF treatment", exact: true }).selectOption("true");
  await panel.getByLabel("Employer PF per month (₹)", { exact: true }).fill("1800");
  await panel.getByLabel("Employee PF per month (₹)", { exact: true }).fill("0");
  await panel.getByLabel("Professional tax per month (₹)", { exact: true }).fill("0");
  await panel.getByRole("button", { name: "Preview breakup", exact: true }).click();
  await expect(panel.getByText("Enter verified monthly TDS", { exact: false })).toBeVisible();
  await panel.getByLabel("TDS per month (₹)", { exact: true }).fill("0");
  await panel.getByRole("button", { name: "Preview breakup", exact: true }).click();
  await expect(panel.getByText("Take-home", { exact: true }).locator("..")).toContainText("₹1,48,200.00");
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Save reviewed package", exact: true }).click();
  await expect(page.getByRole("region", { name: "Saved salary calculation", exact: true })).toContainText("Reviewed package");
  await expect(page.getByRole("button", { name: "Generate payslip", exact: true })).toBeEnabled();
  await page.getByLabel("Salary month", { exact: true }).fill("2026-10");
  await expect(page.getByText("Not saved.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate payslip", exact: true })).toBeDisabled();
});

test("employee files a correction and HR closes it with a note", async ({ page, context }) => {
  await context.addCookies([{ name: "ats_token", value: "mock", url: "http://127.0.0.1:3000" }]);
  let staff = false;
  let requests: Array<Record<string, unknown>> = [];
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    switch (url.pathname) {
      case "/api/auth/me": return route.fulfill({ json: staff
        ? { user: { id: 1, role: "hr" }, permissions: { "employee_directory.view_all": true, "employee_directory.manage": true } }
        : { user: employee, permissions: { "employee_directory.view_self": true } } });
      case "/api/hrms/profile/me": return route.fulfill({ json: { profile: { ...employee, designation: "SDE I" } } });
      case "/api/hrms/employees": return route.fulfill({ json: { employees: [employee] } });
      case "/api/hrms/correction-requests": {
        if (route.request().method() === "POST") {
          const input = route.request().postDataJSON();
          expect(input).toEqual({ category: "profile", subject: "Designation", description: "Please check my job title." });
          requests = [{ id: 1, ...input, status: "pending" }];
        }
        if (route.request().method() === "PATCH") {
          const input = route.request().postDataJSON();
          expect(input).toEqual({ category: "profile", employeeId: 12, id: 1, status: "resolved", note: "Title reviewed." });
          requests = [{ ...requests[0], status: "resolved", resolution_note: input.note }];
        }
        return route.fulfill({ json: { requests } });
      }
      default: return route.fulfill({ json: {} });
    }
  });
  await page.goto("/hrms/my-profile");
  const corrections = page.getByRole("region", { name: "Profile corrections", exact: true });
  await corrections.getByRole("button", { name: "Request a correction", exact: true }).click();
  await corrections.getByRole("combobox", { name: "Field", exact: true }).selectOption("Designation");
  await corrections.getByLabel("What needs to change?", { exact: true }).fill("Please check my job title.");
  await corrections.getByRole("button", { name: "Send to HR", exact: true }).click();
  await expect(corrections).toContainText("Designation · Pending");
  staff = true;
  await page.goto("/hrms/employees/12");
  await corrections.getByRole("button", { name: "Close request", exact: true }).click();
  await corrections.getByLabel("Closing note", { exact: true }).fill("Title reviewed.");
  await corrections.getByRole("button", { name: "Save outcome", exact: true }).click();
  await expect(corrections).toContainText("Designation · Resolved");
  staff = false;
  await page.goto("/hrms/my-profile");
  await expect(corrections).toContainText("HR note · Title reviewed.");
});
