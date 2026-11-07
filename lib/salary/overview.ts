import type { PackageReview, SalaryComponent } from "./types";

export function maskPayrollId(value: unknown) {
  const identifier = String(value ?? "").trim();
  if (!identifier) return null;
  return identifier.length > 4 ? `••••${identifier.slice(-4)}` : "••••";
}

export type EmployeeSalaryOverview = {
  structure: {
    ctc_annual: number;
    effective_from: string;
    mode: "Reviewed package" | "Agreed offer" | "Automatic calculation";
    employer_pf: number | null;
    pan: string | null;
    uan_number: string | null;
    pf_number: string | null;
    bank_account_number: string | null;
  };
  components: SalaryComponent[];
};

export function employeeSalaryOverview(data: { structure: Record<string, unknown>; components: SalaryComponent[] }): EmployeeSalaryOverview {
  const { structure, components } = data;
  const review = structure.package_review as PackageReview | null;
  return { structure: {
    ctc_annual: Number(structure.ctc_annual),
    effective_from: (structure.effective_from instanceof Date ? structure.effective_from.toISOString() : String(structure.effective_from ?? "")).slice(0, 10),
    mode: review ? "Reviewed package" : structure.agreed_breakup ? "Agreed offer" : "Automatic calculation",
    employer_pf: review?.employerPf ?? null,
    pan: maskPayrollId(structure.pan),
    uan_number: maskPayrollId(structure.uan_number),
    pf_number: maskPayrollId(structure.pf_number),
    bank_account_number: maskPayrollId(structure.bank_account_number),
  }, components };
}
