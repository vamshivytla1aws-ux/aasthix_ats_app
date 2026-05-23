import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes("FROM salary_settings")) {
      return { rowCount: 0, rows: [] };
    }
    if (sql.includes("FROM tax_configs")) {
      return { rowCount: 0, rows: [] };
    }
    if (sql.includes("FROM tax_slabs")) {
      return { rowCount: 0, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  }),
}));

import { calculateSalaryStructure } from "@/lib/salary/engine";
import { amountToRupeesWords } from "@/lib/salary/numberToWords";
import { buildPayslipPdf } from "@/lib/pdf/payslipExport";
import type { SalaryCalcInput } from "@/lib/salary/types";

function baseInput(ctcAnnual: number): SalaryCalcInput {
  return {
    employeeId: 1,
    employeeCode: "EMP-001",
    department: "Engineering",
    designation: "Developer",
    dateOfJoining: "2025-01-01",
    pan: "ABCDE1234F",
    uanNumber: "123456789012",
    pfNumber: "PF123",
    bankAccountNumber: "1234567890",
    workLocation: "Hyderabad",
    ctcAnnual,
    salaryMonth: "2026-05-01",
    definedWorkDays: 30,
    totalPaidDays: 30,
    lopDays: 0,
    taxRegime: "new_regime",
    manualTdsAnnual: null,
    professionalTaxMonthly: 200,
    pfEnabled: true,
    employerPfIncludedInCtc: true,
    employeePfEnabled: true,
    healthInsuranceEnabled: false,
    healthInsuranceAnnual: 0,
  };
}

function getComponent(calc: Awaited<ReturnType<typeof calculateSalaryStructure>>, key: string) {
  return [...calc.earningsAnnual, ...calc.deductionsAnnual].find((item) => item.key === key);
}

describe("salary engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates 16L base components correctly", async () => {
    const calc = await calculateSalaryStructure(baseInput(1600000));
    expect(getComponent(calc, "basic")?.annual).toBe(480000);
    expect(getComponent(calc, "basic")?.monthly).toBe(40000);
    expect(getComponent(calc, "hra")?.annual).toBe(240000);
    expect(getComponent(calc, "hra")?.monthly).toBe(20000);
    expect(getComponent(calc, "special_allowance")?.annual).toBe(160000);
    expect(getComponent(calc, "special_allowance")?.monthly).toBe(13333.33);
    expect(getComponent(calc, "conveyance")?.annual).toBe(192000);
    expect(getComponent(calc, "conveyance")?.monthly).toBe(16000);
    expect(getComponent(calc, "other_allowance")?.annual).toBe(506400);
    expect(getComponent(calc, "other_allowance")?.monthly).toBe(42200);
  });

  it("calculates 17L and 18L without circular other allowance", async () => {
    const calc17 = await calculateSalaryStructure(baseInput(1700000));
    const calc18 = await calculateSalaryStructure(baseInput(1800000));
    expect(getComponent(calc17, "other_allowance")?.annual).toBeGreaterThan(0);
    expect(getComponent(calc18, "other_allowance")?.annual).toBeGreaterThan(0);
    expect(getComponent(calc17, "other_allowance")?.annual).toBe(539400);
    expect(getComponent(calc18, "other_allowance")?.annual).toBe(572400);
  });

  it("supports manual tds override", async () => {
    const calc = await calculateSalaryStructure({
      ...baseInput(1600000),
      taxRegime: "manual_tds",
      manualTdsAnnual: 120000,
    });
    expect(calc.annualTax).toBe(120000);
    expect(calc.monthlyTds).toBe(10000);
  });

  it("handles pf disabled", async () => {
    const calc = await calculateSalaryStructure({
      ...baseInput(1600000),
      pfEnabled: false,
      employeePfEnabled: false,
      employerPfIncludedInCtc: false,
    });
    expect(getComponent(calc, "employee_pf")).toBeUndefined();
    expect(getComponent(calc, "employer_pf_adjustment")).toBeUndefined();
  });

  it("handles employer pf included vs excluded", async () => {
    const included = await calculateSalaryStructure({ ...baseInput(1600000), employerPfIncludedInCtc: true });
    const excluded = await calculateSalaryStructure({ ...baseInput(1600000), employerPfIncludedInCtc: false });
    expect(getComponent(included, "employer_pf_adjustment")).toBeUndefined();
    expect(getComponent(excluded, "employer_pf_adjustment")).toBeUndefined();
  });

  it("matches sample mode style net for 18L with PF 1800 and PT 200", async () => {
    const calc = await calculateSalaryStructure(baseInput(1800000));
    expect(calc.grossMonthlySalary).toBe(150000);
    expect(calc.monthlyTds).toBeGreaterThan(0);
    expect(calc.totalMonthlyDeductions).toBeGreaterThan(0);
    expect(calc.netMonthlySalary).toBe(calc.grossMonthlySalary - calc.totalMonthlyDeductions);
  });

  it("returns net salary and words", async () => {
    const calc = await calculateSalaryStructure(baseInput(1600000));
    expect(calc.netMonthlySalary).toBeGreaterThan(0);
    expect(calc.netSalaryInWords.toLowerCase()).toContain("rupees");
  });

  it("calculates day-wise CTC and prorated monthly CTC", async () => {
    const calc = await calculateSalaryStructure({
      ...baseInput(1200000),
      definedWorkDays: 30,
      totalPaidDays: 20,
      lopDays: 2,
    });
    expect(calc.defined_work_days).toBe(30);
    expect(calc.day_wise_ctc).toBe(3333.33);
    expect(calc.payable_days).toBe(18);
    expect(calc.prorated_monthly_ctc).toBe(59999.94);
  });

  it("supports minimum defined work days", async () => {
    const calc = await calculateSalaryStructure({
      ...baseInput(1200000),
      definedWorkDays: 1,
      totalPaidDays: 1,
      lopDays: 0,
    });
    expect(calc.day_wise_ctc).toBe(100000);
    expect(calc.payable_days).toBe(1);
  });

  it("rejects invalid defined work days", async () => {
    await expect(
      calculateSalaryStructure({
        ...baseInput(1200000),
        definedWorkDays: 0,
      })
    ).rejects.toThrow("Defined Work Days must be greater than 0.");
  });

  it("rejects paid days more than defined work days", async () => {
    await expect(
      calculateSalaryStructure({
        ...baseInput(1200000),
        definedWorkDays: 20,
        totalPaidDays: 21,
      })
    ).rejects.toThrow("Total Paid Days cannot exceed Defined Work Days.");
  });
});

describe("salary helper utilities", () => {
  it("converts amount to words", () => {
    expect(amountToRupeesWords(33333)).toContain("Rupees");
  });

  it("payslip pdf generation does not crash", async () => {
    const pdf = await buildPayslipPdf({
      companyName: "AASTHIX TALENT",
      monthLabel: "May 2026",
      employeeName: "Vamshi Krishna",
      employeeCode: "EMP-001",
      department: "Engineering",
      designation: "Frontend Developer",
      dateOfJoining: "2024-04-01",
      pan: "ABCDE1234F",
      uanNumber: "123456789012",
      pfNumber: "PF-0001",
      bankAccountNumber: "000111222333",
      workLocation: "Hyderabad",
      paidDays: 30,
      lopDays: 0,
      earnings: [{ name: "Basic Salary", annual: 480000, monthly: 40000, amountForMonth: 40000 }],
      deductions: [{ name: "Professional Tax", annual: 2400, monthly: 200, amountForMonth: 200 }],
      grossSalary: 40000,
      totalDeductions: 200,
      netSalary: 39800,
      netSalaryInWords: "Thirty Nine Thousand Eight Hundred Rupees Only",
    });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
