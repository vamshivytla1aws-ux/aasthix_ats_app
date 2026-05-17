import { query } from "@/lib/db";
import { amountToRupeesWords } from "@/lib/salary/numberToWords";
import { calculateAnnualTaxFromConfig, loadActiveTaxConfig } from "@/lib/salary/tax";
import type { SalaryCalcInput, SalaryCalcResult, SalaryComponent } from "@/lib/salary/types";

type SalarySettings = {
  monthlyRoundingMode: "two_decimals" | "nearest_rupee";
  professionalTaxDefault: number;
};

function roundAnnual(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) || 0);
}

function roundMonthly(value: number, mode: SalarySettings["monthlyRoundingMode"]) {
  const safe = (Number.isFinite(value) ? value : 0) || 0;
  if (mode === "nearest_rupee") return Math.round(safe);
  return Math.round(safe * 100) / 100;
}

async function loadSalarySettings(): Promise<SalarySettings> {
  const res = await query(
    `SELECT monthly_rounding_mode, professional_tax_default FROM salary_settings ORDER BY id ASC LIMIT 1`,
    []
  );
  if (res.rowCount === 0) {
    return { monthlyRoundingMode: "two_decimals", professionalTaxDefault: 200 };
  }
  const row = res.rows[0] as any;
  return {
    monthlyRoundingMode: row.monthly_rounding_mode === "nearest_rupee" ? "nearest_rupee" : "two_decimals",
    professionalTaxDefault: Number(row.professional_tax_default || 200),
  };
}

function validateInput(input: SalaryCalcInput) {
  if (!(input.ctcAnnual > 0)) throw new Error("CTC Annual must be greater than 0.");
  if (!(input.totalPaidDays > 0)) throw new Error("Total Paid Days must be greater than 0.");
  if (input.lopDays < 0) throw new Error("LOP Days cannot be negative.");
  if (input.lopDays > input.totalPaidDays) throw new Error("LOP Days cannot exceed Total Paid Days.");
  if (input.manualTdsAnnual != null && input.manualTdsAnnual < 0) throw new Error("Manual TDS cannot be negative.");
  const m = new Date(`${input.salaryMonth}T00:00:00`);
  if (!Number.isNaN(m.getTime())) {
    const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    if (input.totalPaidDays > daysInMonth) {
      throw new Error(`Total Paid Days cannot exceed ${daysInMonth} for selected month.`);
    }
  }
}

function earning(name: string, key: string, annual: number, monthly: number, sortOrder: number): SalaryComponent {
  return { name, key, type: "earning", annual, monthly, sortOrder };
}

function deduction(name: string, key: string, annual: number, monthly: number, sortOrder: number): SalaryComponent {
  return { name, key, type: "deduction", annual, monthly, sortOrder };
}

export async function calculateSalaryStructure(input: SalaryCalcInput): Promise<SalaryCalcResult> {
  validateInput(input);
  const settings = await loadSalarySettings();
  const ctcAnnual = Number(input.ctcAnnual);

  const basicAnnual = roundAnnual(ctcAnnual * 0.30);
  const hraAnnual = roundAnnual(ctcAnnual * 0.15);
  const specialAnnual = roundAnnual(ctcAnnual * 0.10);
  const conveyanceAnnual = roundAnnual(ctcAnnual * 0.12);
  const employerPfAnnual = input.pfEnabled ? roundAnnual(15000 * 0.12 * 12) : 0;

  const otherAllowanceAnnual = roundAnnual(
    ctcAnnual - (basicAnnual + hraAnnual + specialAnnual + conveyanceAnnual + employerPfAnnual)
  );

  const earnings: SalaryComponent[] = [
    earning("Basic Salary", "basic", basicAnnual, roundMonthly(basicAnnual / 12, settings.monthlyRoundingMode), 10),
    earning("HRA", "hra", hraAnnual, roundMonthly(hraAnnual / 12, settings.monthlyRoundingMode), 20),
    earning(
      "Special Allowance",
      "special_allowance",
      specialAnnual,
      roundMonthly(specialAnnual / 12, settings.monthlyRoundingMode),
      30
    ),
    earning(
      "Conveyance Allowance",
      "conveyance",
      conveyanceAnnual,
      roundMonthly(conveyanceAnnual / 12, settings.monthlyRoundingMode),
      40
    ),
    earning(
      "Other Allowance",
      "other_allowance",
      Math.max(0, otherAllowanceAnnual),
      roundMonthly(Math.max(0, otherAllowanceAnnual) / 12, settings.monthlyRoundingMode),
      60
    ),
  ];
  if (input.pfEnabled && input.employerPfIncludedInCtc) {
    earnings.splice(
      4,
      0,
      earning("Employer PF", "employer_pf", employerPfAnnual, roundMonthly(employerPfAnnual / 12, settings.monthlyRoundingMode), 50)
    );
  }

  const grossAnnualTaxableSalary = roundAnnual(earnings.reduce((acc, item) => acc + item.annual, 0));
  const grossMonthlySalary = roundMonthly(earnings.reduce((acc, item) => acc + item.monthly, 0), settings.monthlyRoundingMode);

  const professionalTaxMonthly =
    input.professionalTaxMonthly == null ? settings.professionalTaxDefault : Math.max(0, Number(input.professionalTaxMonthly));
  const professionalTaxAnnual = roundAnnual(professionalTaxMonthly * 12);

  const employeePfAnnual = input.pfEnabled && input.employeePfEnabled ? roundAnnual(15000 * 0.12 * 12) : 0;
  const employeePfMonthly = roundMonthly(employeePfAnnual / 12, settings.monthlyRoundingMode);

  const employerPfAdjustmentAnnual = 0;
  const employerPfAdjustmentMonthly = roundMonthly(employerPfAdjustmentAnnual / 12, settings.monthlyRoundingMode);

  const healthInsuranceAnnual = input.healthInsuranceEnabled ? roundAnnual(Number(input.healthInsuranceAnnual || 0)) : 0;
  const healthInsuranceMonthly = roundMonthly(healthInsuranceAnnual / 12, settings.monthlyRoundingMode);

  let taxableIncome = 0;
  let annualTax = 0;
  let monthlyTds = 0;

  if (input.taxRegime === "manual_tds") {
    annualTax = Math.max(0, Number(input.manualTdsAnnual || 0));
    monthlyTds = roundMonthly(annualTax / 12, settings.monthlyRoundingMode);
    taxableIncome = Math.max(0, grossAnnualTaxableSalary);
  } else {
    const config = await loadActiveTaxConfig(input.taxRegime);
    const tax = calculateAnnualTaxFromConfig(grossAnnualTaxableSalary, config);
    taxableIncome = roundAnnual(tax.taxableIncome);
    annualTax = roundAnnual(tax.annualTax);
    monthlyTds = roundMonthly(annualTax / 12, settings.monthlyRoundingMode);
  }

  const deductions: SalaryComponent[] = [
    deduction(
      "Professional Tax",
      "professional_tax",
      professionalTaxAnnual,
      roundMonthly(professionalTaxMonthly, settings.monthlyRoundingMode),
      110
    ),
    deduction("Employer PF (CTC Adjustment)", "employer_pf_adjustment", employerPfAdjustmentAnnual, employerPfAdjustmentMonthly, 115),
    deduction("Employee PF", "employee_pf", employeePfAnnual, employeePfMonthly, 120),
    deduction("TDS", "tds", roundAnnual(annualTax), monthlyTds, 130),
    deduction("Health Insurance", "health_insurance", healthInsuranceAnnual, healthInsuranceMonthly, 140),
  ].filter((component) => component.annual > 0 || component.monthly > 0);

  const totalMonthlyDeductions = roundMonthly(
    deductions.reduce((acc, item) => acc + item.monthly, 0),
    settings.monthlyRoundingMode
  );
  const netMonthlySalary = roundMonthly(grossMonthlySalary - totalMonthlyDeductions, settings.monthlyRoundingMode);
  const netForWords = Math.round(netMonthlySalary);

  return {
    earningsAnnual: earnings,
    deductionsAnnual: deductions,
    taxableIncome,
    annualTax: roundAnnual(annualTax),
    monthlyTds,
    grossMonthlySalary,
    totalMonthlyDeductions,
    netMonthlySalary,
    netSalaryInWords: amountToRupeesWords(netForWords),
    summary: {
      ctcAnnual: roundAnnual(ctcAnnual),
      grossAnnualTaxableSalary,
      totalEarningsAnnual: roundAnnual(earnings.reduce((acc, item) => acc + item.annual, 0)),
      totalDeductionsAnnual: roundAnnual(deductions.reduce((acc, item) => acc + item.annual, 0)),
    },
  };
}
