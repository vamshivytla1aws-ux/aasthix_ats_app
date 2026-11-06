import type { AgreedSalaryBreakup, SalaryCalcInput, SalaryCalcResult, SalaryComponent } from "./types";
import { amountToRupeesWords } from "./numberToWords";

// Annual amounts from the supplied offer. Monthly amounts use whole rupees.
export const OFFER_BREAKUP: AgreedSalaryBreakup = {
  basic: 510000, hra: 255000, special: 170000, conveyance: 204000,
  employerPf: 21600, other: 639400, professionalTax: 2400,
  employerPfDeduction: 21600, employeePf: 21600, tds: 144200,
};

const earningNames = { basic: "Basic Salary", hra: "HRA", special: "Special Allowance", conveyance: "Conveyance Allowance", employerPf: "Employer PF", other: "Other Allowance" };
const deductionNames = { professionalTax: "Professional Tax", employerPfDeduction: "Employer PF", employeePf: "Employee PF", tds: "TDS" };
const cents = (n: number) => Math.round(n * 100) / 100;

export function reconcilePaidAmount(calc: SalaryCalcResult, actualNetPaid: number): SalaryCalcResult {
  if (!Number.isFinite(actualNetPaid) || actualNetPaid < 0 || actualNetPaid > 100000000
    || Math.abs(cents(actualNetPaid) - actualNetPaid) > 0.000001) {
    throw new Error("Enter a valid amount paid with at most two decimal places.");
  }
  // An exact recorded payout needs no separate whole-rupee rounding entry.
  const deductions = calc.deductionsAnnual.filter(row => row.key !== "rounding");
  const totalDeductions = cents(deductions.reduce((sum, row) => sum + (row.amountForMonth ?? row.monthly), 0));
  const difference = cents(actualNetPaid - cents(calc.grossMonthlySalary - totalDeductions));
  const adjustment: SalaryComponent = {
    key: "payment_adjustment", name: "Payment adjustment (actual paid)",
    type: difference > 0 ? "earning" : "deduction",
    annual: 0, monthly: 0, amountForMonth: Math.abs(difference), sortOrder: 990,
  };
  return {
    ...calc,
    earningsAnnual: difference > 0 ? [...calc.earningsAnnual, adjustment] : calc.earningsAnnual,
    deductionsAnnual: difference < 0 ? [...deductions, adjustment] : deductions,
    grossMonthlySalary: cents(calc.grossMonthlySalary + Math.max(0, difference)),
    totalMonthlyDeductions: cents(totalDeductions + Math.max(0, -difference)),
    netMonthlySalary: actualNetPaid,
    netSalaryInWords: amountToRupeesWords(actualNetPaid),
  };
}

export function calculateAgreedSalary(input: SalaryCalcInput): SalaryCalcResult {
  const breakup = input.agreedBreakup!;
  for (const key of Object.keys(OFFER_BREAKUP) as Array<keyof AgreedSalaryBreakup>) {
    if (typeof breakup[key] !== "number" || !Number.isFinite(breakup[key]) || breakup[key] < 0) {
      throw new Error("Enter a valid non-negative annual amount for every salary component.");
    }
  }
  if (![input.ctcAnnual, input.definedWorkDays, input.totalPaidDays, input.lopDays].every(Number.isFinite)
    || input.definedWorkDays <= 0 || input.definedWorkDays > 31 || input.totalPaidDays < 0
    || input.totalPaidDays > input.definedWorkDays || input.lopDays < 0 || input.lopDays > input.totalPaidDays) {
    throw new Error("Check month days, eligible days and absence days.");
  }
  const annualEarnings = Object.keys(earningNames).reduce((sum, key) => sum + breakup[key as keyof AgreedSalaryBreakup], 0);
  if (Math.abs(annualEarnings - input.ctcAnnual) > 0.01) throw new Error("Annual earnings must equal annual CTC.");
  const payable = input.totalPaidDays - input.lopDays;
  const ratio = payable / input.definedWorkDays;
  const rows = (names: Record<string, string>, type: SalaryComponent["type"], offset: number): SalaryComponent[] =>
    Object.entries(names).map(([key, name], index) => {
      const annual = breakup[key as keyof AgreedSalaryBreakup];
      const monthly = Math.round(annual / 12);
      return { key, name, type, annual, monthly, amountForMonth: cents(monthly * ratio), sortOrder: offset + index * 10 };
    });
  const earnings = rows(earningNames, "earning", 10);
  // Keep the monthly earnings total equal to CTC, including rounding of individual rows.
  const other = earnings.find(item => item.key === "other")!;
  other.monthly += Math.round(input.ctcAnnual / 12) - earnings.reduce((sum, item) => sum + item.monthly, 0);
  other.amountForMonth = cents(other.monthly * ratio);
  const deductions = rows(deductionNames, "deduction", 110);
  const gross = cents(earnings.reduce((sum, item) => sum + item.amountForMonth!, 0));
  const deducted = cents(deductions.reduce((sum, item) => sum + item.amountForMonth!, 0));
  if (deducted > gross) throw new Error("Deductions cannot exceed earnings.");
  const net = Math.floor(cents(gross - deducted));
  const rounding = cents(gross - deducted - net);
  if (rounding > 0) deductions.push({ key: "rounding", name: "Rounding adjustment", type: "deduction", annual: 0, monthly: 0, amountForMonth: rounding, sortOrder: 999 });
  return {
    earningsAnnual: earnings, deductionsAnnual: deductions,
    grossMonthlySalary: gross, totalMonthlyDeductions: cents(deducted + rounding), netMonthlySalary: net,
    defined_work_days: input.definedWorkDays, day_wise_ctc: cents(input.ctcAnnual / 12 / input.definedWorkDays),
    payable_days: payable, prorated_monthly_ctc: gross,
    taxableIncome: annualEarnings, annualTax: breakup.tds, monthlyTds: cents(Math.round(breakup.tds / 12) * ratio),
    netSalaryInWords: amountToRupeesWords(net),
    summary: { ctcAnnual: input.ctcAnnual, grossAnnualTaxableSalary: annualEarnings, totalEarningsAnnual: annualEarnings,
      totalDeductionsAnnual: Object.keys(deductionNames).reduce((sum, key) => sum + breakup[key as keyof AgreedSalaryBreakup], 0) },
  };
}
