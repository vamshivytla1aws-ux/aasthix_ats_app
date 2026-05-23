export type TaxRegime = "new_regime" | "old_regime" | "manual_tds";

export type SalaryCalcInput = {
  employeeId: number;
  employeeName?: string;
  employeeCode: string;
  department?: string | null;
  designation?: string | null;
  dateOfJoining?: string | null;
  pan?: string | null;
  uanNumber?: string | null;
  pfNumber?: string | null;
  bankAccountNumber?: string | null;
  workLocation?: string | null;
  ctcAnnual: number;
  salaryMonth: string;
  definedWorkDays: number;
  totalPaidDays: number;
  lopDays: number;
  taxRegime: TaxRegime;
  manualTdsAnnual?: number | null;
  professionalTaxMonthly?: number | null;
  pfEnabled: boolean;
  employerPfIncludedInCtc: boolean;
  employeePfEnabled: boolean;
  healthInsuranceEnabled: boolean;
  healthInsuranceAnnual?: number | null;
};

export type SalaryComponent = {
  key: string;
  name: string;
  type: "earning" | "deduction";
  annual: number;
  monthly: number;
  amountForMonth?: number;
  sortOrder: number;
};

export type SalaryCalcResult = {
  earningsAnnual: SalaryComponent[];
  deductionsAnnual: SalaryComponent[];
  grossMonthlySalary: number;
  totalMonthlyDeductions: number;
  netMonthlySalary: number;
  defined_work_days: number;
  day_wise_ctc: number;
  payable_days: number;
  prorated_monthly_ctc: number;
  taxableIncome: number;
  annualTax: number;
  monthlyTds: number;
  netSalaryInWords: string;
  summary: {
    ctcAnnual: number;
    grossAnnualTaxableSalary: number;
    totalEarningsAnnual: number;
    totalDeductionsAnnual: number;
  };
};

export type PayslipTaxSheetSnapshot = {
  titleMonthLabel: string;
  totalIncomeActualYtd: number;
  projectedIncomeTillMarch: number;
  annualTotalIncome: number;
  additionalIncome: number;
  totalGrossIncome: number;
  actualHraReceived: number;
  grossSalaryBeforeStdDeduction: number;
  standardDeduction: number;
  grossSalaryAfterStdDeduction: number;
  totalIncomeFromSalary: number;
  grossTaxableIncome: number;
  rebate: number;
  totalInvestments: number;
  netTaxableIncomeRoundedOff: number;
  incomeTaxPayable: number;
  cess: number;
  totalIncomeTaxPayable: number;
  balanceTax: number;
  monthlyTaxDeduction: number[]; // Apr..Mar
};

export type TaxSlab = {
  minAmount: number;
  maxAmount: number | null;
  ratePercent: number;
};

export type TaxConfig = {
  financialYear: string;
  regime: "new_regime" | "old_regime";
  standardDeduction: number;
  rebateThreshold: number;
  cessPercent: number;
  slabs: TaxSlab[];
};
