export const CORRECTION_CATEGORIES = ["profile", "salary", "payslip"] as const;
export type CorrectionCategory = typeof CORRECTION_CATEGORIES[number];
export const CORRECTION_FIELDS = {
  profile: ["Name", "Email", "Phone", "Department", "Designation", "Employment type", "Joining date", "Work location", "Reporting manager", "Other profile detail"],
  salary: ["Annual package", "Earnings", "Deductions", "Payroll identifiers", "Effective month", "Other salary detail"],
};
export type CorrectionRequest = {
  id: number;
  category: CorrectionCategory;
  subject: string;
  description: string;
  status: "pending" | "resolved" | "declined";
  resolution_note: string | null;
};
