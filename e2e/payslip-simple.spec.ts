import { test, expect } from "@playwright/test";
import { OFFER_BREAKUP, calculateAgreedSalary, reconcilePaidAmount } from "../lib/salary/agreed";

for (const width of [1440, 390]) {
 test(`November uses the explicitly saved offer after reviewing an automatic setup at ${width}px`, async ({ page, context }) => {
    await page.clock.setFixedTime(new Date("2026-10-10T06:00:00Z"));
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: "ats_token", value: "mock", url: "http://127.0.0.1:3000" }]);
    const employee = { id: 1, full_name: "Sample Employee", email: "employee@example.test", employee_code: "EMP-1", role: "employee" };
    let structure: any = { ctc_annual: 1800000, agreed_breakup: null, salary_month: "2026-10-01", bank_account_number: "saved-bank", tax_regime: "new_regime" };
    const monthStructures = new Map<string, any>([["2026-10", structure]]);
    let saves = 0;
    await page.route("**/api/**", async route => {
      const url = new URL(route.request().url()), path = url.pathname;
      let body: unknown = {};
      if (path === "/api/auth/me") body = { user: { id: 9, role: "workspace_owner" }, permissions: { "employee_directory.view_all": true, "salary.view": true, "salary.manage": true } };
      else if (path === "/api/hrms/employees") body = { employees: [employee] };
      else if (path === "/api/salary-structures/1") body = { structure: monthStructures.get(url.searchParams.get("month") || "") || structure };
      else if (path === "/api/payslips/1") body = { payslips: [] };
      else if (path === "/api/salary-structures") {
        const input = route.request().postDataJSON();
        expect(input).toMatchObject({ employeeId: 1, ctcAnnual: 1800000, agreedBreakup: OFFER_BREAKUP, bankAccountNumber: "saved-bank" });
        expect(["2026-10-01", "2026-11-01"]).toContain(input.salaryMonth);
        saves++;
        const updated = { ...structure, agreed_breakup: input.agreedBreakup, salary_month: input.salaryMonth };
        monthStructures.set(input.salaryMonth.slice(0, 7), updated);
        if (input.salaryMonth >= structure.salary_month) structure = updated;
        body = { ok: true, calculation: calculateAgreedSalary(input) };
      } else if (path === "/api/payslips/generate") {
        const input = route.request().postDataJSON();
        expect(input.preview).toBe(true);
        const applicable = monthStructures.get(`${input.year}-${String(input.month).padStart(2, "0")}`) || structure;
        expect(applicable.agreed_breakup).toEqual(OFFER_BREAKUP);
        body = { calculation: calculateAgreedSalary({ employeeId: 1, employeeCode: "EMP-1", ctcAnnual: 1800000,
          salaryMonth: `${input.year}-${String(input.month).padStart(2, "0")}-01`, definedWorkDays: input.definedWorkDays,
          totalPaidDays: input.paidDays, lopDays: input.lopDays, taxRegime: "manual_tds", pfEnabled: true,
          employerPfIncludedInCtc: true, employeePfEnabled: true, healthInsuranceEnabled: false, agreedBreakup: applicable.agreed_breakup }) };
      }
      await route.fulfill({ json: body });
    });
    await page.goto("/hrms/employees/1?tab=salary");
    const method = page.getByRole("region", { name: "Saved salary calculation", exact: true });
    await expect(method).toContainText("Automatic calculation");
    await expect(method).toContainText("net pay of ₹1,34,183");
    expect(saves).toBe(0);
    await page.getByLabel("Salary month", { exact: true }).fill("2026-11");
    await page.getByRole("button", { name: "Review supplied ₹18 lakh offer", exact: true }).click();
    await expect(page.getByRole("button", { name: "Generate payslip", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Basic salary (annual)", { exact: true })).toHaveValue("510000");
    await page.getByRole("button", { name: "Save Structure", exact: true }).click();
    await expect(method).toContainText("Agreed offer breakup");
    await expect(page.getByLabel("Basic salary (annual)", { exact: true })).not.toBeVisible();
    await expect(page.getByLabel("Salary month", { exact: true })).toHaveValue("2026-11");
    await page.getByRole("button", { name: "Preview payslip", exact: true }).click();
    await expect(page.getByText("Net pay: ₹1,34,183.00", { exact: true })).toBeVisible();
    await expect(page.getByText("Deductions: ₹15,817.00", { exact: true })).toBeVisible();
    await page.reload();
    await expect(method).toContainText("Automatic calculation");
    await page.getByLabel("Salary month", { exact: true }).fill("2026-11");
    await expect(method).toContainText("Agreed offer breakup");
    await page.getByRole("button", { name: "Preview payslip", exact: true }).click();
    await expect(page.getByText("Net pay: ₹1,34,183.00", { exact: true })).toBeVisible();
    // October still has an older automatic structure even though the latest November setup is agreed.
    await page.getByLabel("Salary month", { exact: true }).fill("2026-10");
    await expect(method).toContainText("Automatic calculation");
    await expect(method).toContainText("Effective month 2026-10");
    await expect(page.getByLabel("Amount already paid (optional)", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Review supplied ₹18 lakh offer", exact: true }).click();
    await page.getByRole("button", { name: "Save Structure", exact: true }).click();
    // The latest November response stays identical; saving an older month must still clear the unsaved flag.
    await expect(method).toContainText("Agreed offer breakup");
    await expect(page.getByRole("button", { name: "Preview payslip", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Preview payslip", exact: true }).click();
    await expect(page.getByText("Net pay: ₹1,34,183.00", { exact: true })).toBeVisible();
    expect(saves).toBe(2);
 });
 for (const actualPayment of [false, true]) {
  test(`simple payslip ${actualPayment ? "actual payment" : "calculated"} at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: "ats_token", value: "mock-ui-test-only", url: "http://127.0.0.1:3000" }]);
    const employee = { id: 1, full_name: "Sample Employee", email: "sample@example.test", employee_code: "TEST-1", department: "Engineering", designation: "SDE II" };
    const base = calculateAgreedSalary({ employeeId: 1, employeeCode: "TEST-1", ctcAnnual: 1800000, salaryMonth: "2026-07-01", definedWorkDays: 31, totalPaidDays: actualPayment ? 14 : 31, lopDays: 1,
      taxRegime: "manual_tds", pfEnabled: true, employerPfIncludedInCtc: true, employeePfEnabled: true, healthInsuranceEnabled: false, agreedBreakup: OFFER_BREAKUP });
    const calculation = actualPayment ? reconcilePaidAmount(base, 60598) : base;
    let generated = false;
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown = { items: [], members: [], users: [], notifications: [], alerts: [], conversations: [] };
      if (path === "/api/auth/me") body = { user: { ...employee, role: "workspace_owner" }, permissions: { "employee_directory.view_all": true, "salary.manage": true, "salary.view": true } };
      else if (path === "/api/hrms/employees" || path === "/api/salary-structures") body = { employees: [employee] };
      else if (path === "/api/hrms/summary") body = { summary: {} };
      else if (path === "/api/salary-structures/1") body = { structure: { ...employee, ctc_annual: 1800000, salary_month: "2026-05-01", agreed_breakup: OFFER_BREAKUP } };
      else if (path === "/api/payslips/1") body = { payslips: generated ? [{ id: 7, month: 7, year: 2026, paid_days: 30, gross_monthly: calculation.grossMonthlySalary, net_salary: calculation.netMonthlySalary }] : [] };
      else if (path === "/api/payslips/generate") {
        const payload = route.request().postDataJSON();
        expect(payload).toMatchObject({ employeeId: 1, year: 2026, month: actualPayment ? 5 : 7, definedWorkDays: 31, paidDays: actualPayment ? 14 : 31, lopDays: 1 });
        if (actualPayment) expect(payload.actualNetPaid).toBe(60598);
        if (payload.preview) body = { calculation };
        else { generated = true; body = { payslipId: 7, operation_status: "success" }; }
      } else if (path === "/api/payslips/7/data") body = { data: { companyName: "AASTHIX TALENT", monthLabel: "July 2026", employeeName: employee.full_name, employeeCode: "TEST-1", department: "Engineering", designation: "SDE II", paidDays: 30, lopDays: 1, calculation } };
      await route.fulfill({ json: body });
    });
    await page.goto("/hrms/employees/1?tab=salary");
    await expect(page.getByRole("heading", { name: "Generate payslip", exact: true })).toBeVisible();
    await expect(page.getByText("Use supplied ₹18 lakh offer breakup", { exact: true })).not.toBeVisible();
    await page.getByLabel("Salary month", { exact: true }).fill(actualPayment ? "2026-05" : "2026-07");
    if (actualPayment) {
      await page.getByLabel("Eligible days before absence", { exact: true }).fill("14");
      await page.getByLabel("Amount already paid (optional)", { exact: true }).fill("60598");
    }
    await page.getByLabel("Absent / unpaid days", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Preview payslip", exact: true }).click();
    await expect(page.getByText(actualPayment ? "Net pay: ₹60,598.00" : "Net pay: ₹1,29,854.00", { exact: true })).toBeVisible();
    if (actualPayment) await expect(page.getByText("Payment adjustment (actual paid): +₹4,327.72", { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/payslip-simple-${width}-${actualPayment}.png`, fullPage: true });
    await page.getByRole("button", { name: "Generate payslip", exact: true }).click();
    await expect(page.getByRole("button", { name: "Download PDF", exact: true })).toBeVisible();
    expect(generated).toBe(true);
  });
 }
}
