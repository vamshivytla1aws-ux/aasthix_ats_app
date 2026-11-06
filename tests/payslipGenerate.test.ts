import { beforeEach, describe, expect, it, vi } from "vitest";
import { OFFER_BREAKUP } from "@/lib/salary/agreed";

vi.mock("@/lib/rbac", () => ({ requirePermission: vi.fn(async () => ({ ok: true, access: { user_id: 9 } })) }));
vi.mock("@/lib/db", () => ({ query: vi.fn(async () => ({ rows: [{ id: 7 }], rowCount: 1 })) }));
vi.mock("@/lib/leave", () => ({ getMonthlyApprovedLopDays: vi.fn(async () => 1) }));
vi.mock("@/lib/hrms/payroll", () => ({ getPayrollRunByMonthYear: vi.fn(async () => null) }));
vi.mock("@/lib/pdf/payslipExport", () => ({ buildPayslipPdf: vi.fn(async () => Buffer.from("pdf")) }));
vi.mock("@/lib/salary/service", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/salary/service")>(),
  getSalaryStructureForMonth: vi.fn(), getLatestSalaryStructure: vi.fn(),
}));
import { POST } from "@/app/api/payslips/generate/route";
import { query } from "@/lib/db";
import { getMonthlyApprovedLopDays } from "@/lib/leave";
import { getPayrollRunByMonthYear } from "@/lib/hrms/payroll";
import { getSalaryStructureForMonth } from "@/lib/salary/service";
import { buildPayslipPdf } from "@/lib/pdf/payslipExport";

const request = (extra = {}) => new Request("http://localhost/api/payslips/generate", {
  method: "POST", body: JSON.stringify({ employeeId: 1, year: 2026, month: 7, paidDays: 31, lopDays: 1, ...extra }),
});
describe("simple payslip generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(query).mockImplementation(async (sql: string) => ({ rows: sql.includes("FROM users") ? [{ id: 1, full_name: "Current Employee", employee_code: "CURRENT-1", department: "Product", designation: "Lead", joining_date: "2026-05-13", work_location: "Hyderabad" }] : [{ id: 7 }], rowCount: 1 }));
    vi.mocked(getPayrollRunByMonthYear).mockResolvedValue(null);
    vi.mocked(getSalaryStructureForMonth).mockResolvedValue({ structure: {
      id: 4, employee_id: 1, ctc_annual: 1800000, salary_month: "2026-05-01",
      defined_work_days: 31, total_paid_days: 13, lop_days: 1, agreed_breakup: OFFER_BREAKUP,
    }, components: [] });
  });
  it("previews without writing or rendering and does not add recorded leave twice", async () => {
    const response = await POST(request({ preview: true }));
    expect(response.status).toBe(200);
    expect((await response.json()).calculation.netMonthlySalary).toBe(129854);
    expect(query).not.toHaveBeenCalled();
    expect(buildPayslipPdf).not.toHaveBeenCalled();
    expect(getMonthlyApprovedLopDays).not.toHaveBeenCalled();
  });
  it("uses identical totals for the saved PDF and payslip", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).netSalary).toBe(129854);
    expect(buildPayslipPdf).toHaveBeenCalledWith(expect.objectContaining({ netSalary: 129854, paidDays: 30, lopDays: 1, simple: true, taxSheetSnapshot: null }));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO payslips"), expect.arrayContaining([129854]));
    expect(buildPayslipPdf).toHaveBeenCalledWith(expect.objectContaining({ employeeName: "Current Employee", employeeCode: "CURRENT-1", department: "Product" }));
    const saved = vi.mocked(query).mock.calls.find(([sql]) => sql.includes("INSERT INTO payslips"))!;
    expect(saved[0]).toContain("employee_snapshot");
    expect(JSON.parse(String(saved[1]![13]))).toMatchObject({ version: 1, employeeName: "Current Employee", department: "Product", ctcAnnual: 1800000, simple: true });
  });
  it("resets saved partial-month values for a full June salary", async () => {
    const response = await POST(request({ month: 6, paidDays: 30, lopDays: 0, preview: true }));
    expect((await response.json()).calculation.netMonthlySalary).toBe(134183);
  });
  it("saves May with 13 paid days, actual net and a visible adjustment", async () => {
    const response = await POST(request({ month: 5, paidDays: 14, lopDays: 1, actualNetPaid: 60598 }));
    expect(response.status).toBe(200);
    expect((await response.json()).netSalary).toBe(60598);
    expect(buildPayslipPdf).toHaveBeenCalledWith(expect.objectContaining({ netSalary: 60598, paidDays: 13, lopDays: 1,
      earnings: expect.arrayContaining([expect.objectContaining({ name: "Payment adjustment (actual paid)", amountForMonth: 4327.72 })]) }));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO payslip_line_items"), expect.arrayContaining(["Payment adjustment (actual paid)", 4327.72]));
  });
  it("uses the same adjustment in preview without writes", async () => {
    const response = await POST(request({ month: 5, paidDays: 14, lopDays: 1, actualNetPaid: 60598, preview: true }));
    const data = await response.json();
    expect(data.calculation.netMonthlySalary).toBe(60598);
    expect(data.calculation.earningsAnnual.find((row: any) => row.key === "payment_adjustment").amountForMonth).toBe(4327.72);
    expect(query).not.toHaveBeenCalled();
  });
  it.each([-1, "60598", 60598.001, 100000001])("rejects invalid actual payment %s", async actualNetPaid => {
    expect((await POST(request({ actualNetPaid }))).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it.each([{ paidDays: -1 }, { paidDays: 32 }, { lopDays: -1 }, { definedWorkDays: 32 }, { month: 7.5 }])("rejects bad days/month %j", async extra => {
    expect((await POST(request(extra))).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
  it("blocks regeneration for locked payroll", async () => {
    vi.mocked(getPayrollRunByMonthYear).mockResolvedValue({ status: "locked" } as any);
    expect((await POST(request())).status).toBe(409);
    expect(query).not.toHaveBeenCalled();
  });
});
