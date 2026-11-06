import { query } from "@/lib/db";

export type EmployeePayslipSnapshot = {
  version: 1; employeeName: string; employeeCode: string; department: string; designation: string;
  dateOfJoining: string; workLocation: string; pan: string; uanNumber: string; pfNumber: string;
  bankAccountNumber: string; ctcAnnual: number; simple: boolean;
};

export async function loadEmployeeSnapshot(employeeId: number, structure: Record<string, unknown>): Promise<EmployeePayslipSnapshot> {
  const result = await query(`SELECT full_name, employee_code, department, designation,
    to_char(joining_date, 'YYYY-MM-DD') AS joining_date, work_location FROM users WHERE id = $1`, [employeeId]);
  const employee = result.rows[0];
  if (!employee) throw new Error("Employee profile not found.");
  const value = (input: unknown) => String(input ?? "");
  return { version: 1, employeeName: value(employee.full_name), employeeCode: value(employee.employee_code), department: value(employee.department),
    designation: value(employee.designation), dateOfJoining: value(employee.joining_date), workLocation: value(employee.work_location),
    pan: value(structure.pan), uanNumber: value(structure.uan_number), pfNumber: value(structure.pf_number),
    bankAccountNumber: value(structure.bank_account_number), ctcAnnual: Number(structure.ctc_annual || 0), simple: Boolean(structure.agreed_breakup) };
}

export function readEmployeeSnapshot(value: unknown): EmployeePayslipSnapshot | null {
  if (value == null) return null;
  const snapshot = typeof value === "string" ? JSON.parse(value) : value;
  const keys = ["employeeName", "employeeCode", "department", "designation", "dateOfJoining", "workLocation", "pan", "uanNumber", "pfNumber", "bankAccountNumber"];
  if (!snapshot || snapshot.version !== 1 || !keys.every(key => typeof snapshot[key] === "string") || !Number.isFinite(snapshot.ctcAnnual) || typeof snapshot.simple !== "boolean") {
    throw new Error("Stored payslip employee details are invalid.");
  }
  return snapshot;
}

/** Null snapshots use the legacy query fields; never backfill guessed historical values. */
export function withEmployeeSnapshot(row: Record<string, unknown>) {
  const snapshot = readEmployeeSnapshot(row.employee_snapshot);
  if (!snapshot) return row;
  return { ...row, full_name: snapshot.employeeName, employee_name: snapshot.employeeName, employee_code: snapshot.employeeCode,
    department: snapshot.department, designation: snapshot.designation, date_of_joining: snapshot.dateOfJoining,
    work_location: snapshot.workLocation, pan: snapshot.pan, uan_number: snapshot.uanNumber, pf_number: snapshot.pfNumber,
    bank_account_number: snapshot.bankAccountNumber, ctc_annual: snapshot.ctcAnnual, snapshot_simple: snapshot.simple };
}
