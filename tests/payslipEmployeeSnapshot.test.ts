import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ requirePermission: vi.fn(async () => ({ ok: true, access: { user_id: 12, role: "employee" } })), getAuthAccess: vi.fn(async () => ({ user_id: 12, role: "employee" })) }));
vi.mock("@/lib/pdf/payslipExport", () => ({ buildPayslipPdf: vi.fn(async () => Buffer.from("generated-pdf")) }));
import { query } from "@/lib/db";
import { loadEmployeeSnapshot, withEmployeeSnapshot, readEmployeeSnapshot } from "@/lib/salary/employeeSnapshot";
import { GET as dataRoute } from "@/app/api/payslips/[id]/data/route";
import { GET as download } from "@/app/api/payslips/[id]/download/route";
import { buildPayslipPdf } from "@/lib/pdf/payslipExport";
const snapshot = { version: 1 as const, employeeName: "Original Name", employeeCode: "EMP-12", department: "Engineering", designation: "SDE II", dateOfJoining: "2026-05-13", workLocation: "Bangalore", pan: "ABCDE1234F", uanNumber: "123", pfNumber: "PF-12", bankAccountNumber: "original-bank", ctcAnnual: 1800000, simple: true };
const row = { id: 7, employee_id: 12, month: 5, year: 2026, full_name: "Edited Name", department: "Edited Department", bank_account_number: "edited-bank", employee_snapshot: snapshot, gross_monthly: 67230.94, total_deductions: 6632.94, net_salary: 60598, pdf_blob: Buffer.from("original-pdf") };
const request = new Request("http://localhost/test"), context = { params: { id: "7" } };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(query).mockImplementation(async (sql: string) => ({ rows: sql.includes("payslip_line_items") ? [] : [row], rowCount: 1 })); });
describe("historical payslip identity", () => {
  it("prefers the snapshot after personal and bank details are edited", () => {
    expect(withEmployeeSnapshot(row)).toMatchObject({ full_name: "Original Name", department: "Engineering", bank_account_number: "original-bank" });
    expect(row.full_name).toBe("Edited Name");
  });
  it("returns the same original identity in the payslip preview", async () => {
    const data = await (await dataRoute(request, context)).json();
    expect(data.data).toMatchObject({ employeeName: "Original Name", bankAccountNumber: "original-bank", designation: "SDE II" });
    expect(data.data.calculation.netMonthlySalary).toBe(60598);
  });
  it("returns an existing PDF byte-for-byte without regenerating or backfilling", async () => {
    const response = await download(request, context);
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("original-pdf");
    expect(buildPayslipPdf).not.toHaveBeenCalled(); expect(query).toHaveBeenCalledTimes(1);
  });
  it("preserves existing legacy PDFs without a tax sheet or employee snapshot", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [{ ...row, employee_snapshot: null, agreed_breakup: null, tax_sheet_snapshot: null }], rowCount: 1 });
    expect(Buffer.from(await (await download(request, context)).arrayBuffer()).toString()).toBe("original-pdf");
    expect(buildPayslipPdf).not.toHaveBeenCalled(); expect(query).toHaveBeenCalledTimes(1);
  });
  it("uses the snapshot if a missing PDF must be rebuilt", async () => {
    vi.mocked(query).mockImplementation(async (sql: string) => ({ rows: sql.includes("payslip_line_items") ? [] : [{ ...row, pdf_blob: null }], rowCount: 1 }));
    expect((await download(request, context)).status).toBe(200);
    expect(buildPayslipPdf).toHaveBeenCalledWith(expect.objectContaining({ employeeName: "Original Name", bankAccountNumber: "original-bank", simple: true }));
  });
  it("keeps the legacy fallback and rejects malformed snapshots", () => {
    expect(withEmployeeSnapshot({ full_name: "Legacy", employee_snapshot: null }).full_name).toBe("Legacy");
    expect(readEmployeeSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
    expect(() => readEmployeeSnapshot({ version: 1 })).toThrow();
  });
  it("builds new snapshots from current profile identity and saved payroll identity", async () => {
    vi.mocked(query).mockResolvedValue({ rows: [{ full_name: "Current Name", employee_code: "CURRENT", department: "Current Department", joining_date: "2026-05-13" }], rowCount: 1 });
    expect(await loadEmployeeSnapshot(12, { employee_name: "Stale Name", department: "Stale Department", pan: "PAN", bank_account_number: "current-bank", ctc_annual: 1800000 })).toMatchObject({ employeeName: "Current Name", department: "Current Department", bankAccountNumber: "current-bank", pan: "PAN" });
  });
});
