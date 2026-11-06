import { test, expect } from "@playwright/test";
import { OFFER_BREAKUP, calculateAgreedSalary, reconcilePaidAmount } from "../lib/salary/agreed";

for (const width of [1440, 390]) {
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
