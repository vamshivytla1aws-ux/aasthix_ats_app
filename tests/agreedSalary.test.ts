import { describe, expect, it } from "vitest";
import { calculateAgreedSalary, OFFER_BREAKUP, reconcilePaidAmount } from "@/lib/salary/agreed";
import type { SalaryCalcInput } from "@/lib/salary/types";

const input: SalaryCalcInput = {
  employeeId: 1, employeeCode: "TEST", ctcAnnual: 1800000,
  salaryMonth: "2026-07-01", definedWorkDays: 31, totalPaidDays: 31, lopDays: 0,
  taxRegime: "manual_tds", pfEnabled: true, employerPfIncludedInCtc: true,
  employeePfEnabled: true, healthInsuranceEnabled: false, agreedBreakup: OFFER_BREAKUP,
};

describe("agreed offer payslips", () => {
  it("keeps May's 13 paid days and reconciles the actual payment visibly", () => {
    const base = calculateAgreedSalary({ ...input, totalPaidDays: 14, lopDays: 1 });
    const calc = reconcilePaidAmount(base, 60598);
    expect(calc.payable_days).toBe(13);
    expect(calc.netMonthlySalary).toBe(60598);
    expect(calc.earningsAnnual.find(row => row.key === "payment_adjustment")).toMatchObject({ amountForMonth: 4327.72, annual: 0, monthly: 0 });
    expect(calc.deductionsAnnual).toEqual(base.deductionsAnnual.filter(row => row.key !== "rounding"));
    expect(calc.deductionsAnnual.some(row => row.key === "rounding")).toBe(false);
    expect(base.netMonthlySalary).toBe(56270);
    expect(calc.grossMonthlySalary - calc.totalMonthlyDeductions).toBeCloseTo(60598);
  });
  it("shows a lower paid amount as a separate deduction", () => {
    const calc = reconcilePaidAmount(calculateAgreedSalary(input), 130000.25);
    expect(calc.netMonthlySalary).toBe(130000.25);
    expect(calc.deductionsAnnual.find(row => row.key === "payment_adjustment")?.amountForMonth).toBe(4182.75);
    expect(calc.netSalaryInWords).toContain("Twenty Five Paise");
  });
  it.each([-1, NaN, Infinity, 1.001, 100000001])("rejects invalid paid amounts %s", value => {
    expect(() => reconcilePaidAmount(calculateAgreedSalary(input), value)).toThrow();
  });
  it("matches every full-month component and the offered net", () => {
    const calc = calculateAgreedSalary(input);
    expect(calc.earningsAnnual.map(item => item.monthly)).toEqual([42500, 21250, 14167, 17000, 1800, 53283]);
    expect(calc.deductionsAnnual.map(item => item.monthly)).toEqual([200, 1800, 1800, 12017]);
    expect(calc.summary.totalDeductionsAnnual).toBe(189800);
    expect(calc.grossMonthlySalary).toBe(150000);
    expect(calc.totalMonthlyDeductions).toBe(15817);
    expect(calc.netMonthlySalary).toBe(134183);
  });
  it.each([[31, 0, 134183], [31, 1, 129854], [15, 1, 60598], [0, 0, 0], [31, 31, 0]])(
    "reconciles eligible %s minus absent %s to net %s", (eligible, absent, expected) => {
      const calc = calculateAgreedSalary({ ...input, totalPaidDays: eligible, lopDays: absent });
      expect(calc.netMonthlySalary).toBe(expected);
      const earnings = calc.earningsAnnual.reduce((sum, row) => sum + row.amountForMonth!, 0);
      const deductions = calc.deductionsAnnual.reduce((sum, row) => sum + row.amountForMonth!, 0);
      expect(Math.round((earnings - deductions) * 100) / 100).toBe(expected);
    });
  it("pays the same full-month salary for a 30-day month", () => {
    expect(calculateAgreedSalary({ ...input, salaryMonth: "2026-06-01", definedWorkDays: 30, totalPaidDays: 30 }).netMonthlySalary).toBe(134183);
  });
  it.each([
    { totalPaidDays: 32 }, { lopDays: -1 }, { definedWorkDays: 0 }, { totalPaidDays: NaN },
    { agreedBreakup: { ...OFFER_BREAKUP, tds: -1 } },
    { agreedBreakup: { ...OFFER_BREAKUP, tds: Infinity } }, { ctcAnnual: 1600000 },
  ])("rejects invalid setup or days: %j", override => {
    expect(() => calculateAgreedSalary({ ...input, ...override })).toThrow();
  });
});
