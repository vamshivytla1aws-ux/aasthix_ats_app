import { amountToRupeesWords } from "./numberToWords";
import type { PackageReview, SalaryCalcInput, SalaryCalcResult, SalaryComponent } from "./types";

export const salaryMonthPattern = /^(?:20\d\d|[2-9]\d{3})-(0[1-9]|1[0-2])$/;
export const roundMoney = (amount: number) => Math.round(amount * 100) / 100;
const isMoney = (amount: unknown): amount is number =>
  typeof amount === "number" && Number.isFinite(amount) && amount >= 0 && amount <= 100_000_000
  && Math.abs(roundMoney(amount) - amount) < 0.000001;

type PackageDraft = Partial<PackageReview>;

export function estimatePackage(ctcAnnual: number, draft: PackageDraft) {
  if (!isMoney(ctcAnnual) || ctcAnnual <= 0) throw new Error("Enter a valid annual package.");
  if (draft.regime !== "new_regime" && draft.regime !== "old_regime" && draft.regime !== "manual_tds") {
    throw new Error("Choose a tax regime.");
  }
  for (const amount of [draft.employerPf, draft.employeePf, draft.professionalTax, draft.tds]) {
    if (amount != null && !isMoney(amount)) throw new Error("Enter non-negative monthly amounts with up to two decimal places.");
  }
  if (draft.employerPfInCtc != null && typeof draft.employerPfInCtc !== "boolean") throw new Error("Choose whether employer PF is included.");
  const employerPf = draft.employerPf ?? null;
  const monthlyCtc = roundMoney(ctcAnnual / 12);
  const cashGross = employerPf == null || draft.employerPfInCtc == null
    ? null : roundMoney(monthlyCtc - (draft.employerPfInCtc ? employerPf : 0));
  if (cashGross != null && cashGross <= 0) throw new Error("Employer PF must leave a positive cash gross.");
  const deductions = [draft.employeePf, draft.professionalTax, draft.tds];
  const totalDeductions = deductions.every(isMoney) ? roundMoney(deductions.reduce<number>((sum, value) => sum + (value ?? 0), 0)) : null;
  if (cashGross != null && totalDeductions != null && totalDeductions > cashGross) throw new Error("Deductions cannot exceed cash gross.");
  const splitBase = cashGross ?? monthlyCtc;
  const earnings = [
    component("earning", "basic", "Basic Salary", roundMoney(splitBase * 0.30), 10),
    component("earning", "hra", "HRA", roundMoney(splitBase * 0.15), 20),
    component("earning", "special_allowance", "Special Allowance", roundMoney(splitBase * 0.10), 30),
    component("earning", "conveyance", "Conveyance Allowance", roundMoney(splitBase * 0.12), 40),
  ];
  earnings.push(component("earning", "other_allowance", "Other Allowance", roundMoney(splitBase - earnings.reduce((sum, row) => sum + row.monthly, 0)), 50));
  return {
    ctcAnnual, monthlyCtc, cashGross, employerPf, earnings, totalDeductions,
    totalEmployerCost: cashGross == null || employerPf == null ? null : roundMoney(cashGross + employerPf),
    net: cashGross == null || totalDeductions == null ? null : roundMoney(cashGross - totalDeductions),
  };
}

function component(type: SalaryComponent["type"], key: string, name: string, monthly: number, sortOrder: number): SalaryComponent {
  return { type, key, name, monthly, annual: roundMoney(monthly * 12), sortOrder };
}

export function calculateReviewedPackage(input: SalaryCalcInput): SalaryCalcResult {
  const review = input.packageReview!;
  const estimate = estimatePackage(input.ctcAnnual, review);
  if (estimate.net == null || estimate.cashGross == null) throw new Error("Confirm employer PF treatment, PF, professional tax and TDS. Enter zero where applicable.");
  const { definedWorkDays, totalPaidDays, lopDays } = input;
  if (![definedWorkDays, totalPaidDays, lopDays].every(Number.isFinite) || definedWorkDays <= 0 || definedWorkDays > 31
    || totalPaidDays < 0 || totalPaidDays > definedWorkDays || lopDays < 0 || lopDays > totalPaidDays) {
    throw new Error("Check month days, eligible days and absence days.");
  }
  const payable = totalPaidDays - lopDays;
  const ratio = payable / definedWorkDays;
  const prorate = (row: SalaryComponent) => ({ ...row, amountForMonth: roundMoney(row.monthly * ratio) });
  const earnings = estimate.earnings.map(prorate);
  const deductions = [
    component("deduction", "employee_pf", "Employee PF", review.employeePf, 110),
    component("deduction", "professional_tax", "Professional Tax", review.professionalTax, 120),
    component("deduction", "tds", "TDS", review.tds, 130),
  ].map(prorate);
  const gross = roundMoney(estimate.cashGross * ratio);
  const deducted = roundMoney((estimate.totalDeductions ?? 0) * ratio);
  // Put rounding remainders on the largest line so the displayed rows add up.
  for (const [rows, total] of [[earnings, gross], [deductions, deducted]] as const) {
    const largest = rows.reduce((max, row) => row.amountForMonth > max.amountForMonth ? row : max);
    largest.amountForMonth = roundMoney(total - rows.reduce((sum, row) => row === largest ? sum : sum + row.amountForMonth, 0));
  }
  const net = roundMoney(gross - deducted);
  return {
    earningsAnnual: earnings, deductionsAnnual: deductions, grossMonthlySalary: gross, totalMonthlyDeductions: deducted, netMonthlySalary: net,
    defined_work_days: definedWorkDays, day_wise_ctc: roundMoney(estimate.monthlyCtc / definedWorkDays),
    payable_days: payable, prorated_monthly_ctc: roundMoney(estimate.monthlyCtc * ratio),
    taxableIncome: roundMoney(estimate.cashGross * 12), annualTax: roundMoney(review.tds * 12),
    monthlyTds: deductions[2].amountForMonth, netSalaryInWords: amountToRupeesWords(net),
    summary: { ctcAnnual: input.ctcAnnual, grossAnnualTaxableSalary: roundMoney(estimate.cashGross * 12),
      totalEarningsAnnual: roundMoney(estimate.cashGross * 12), totalDeductionsAnnual: roundMoney((estimate.totalDeductions ?? 0) * 12) },
  };
}
