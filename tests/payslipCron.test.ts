import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/db", () => ({ query: vi.fn() }));
vi.mock("@/lib/hrms/payroll", () => ({ getPayrollRunByMonthYear: vi.fn(async () => null) }));
vi.mock("@/lib/salary/engine", () => ({ calculateSalaryStructure: vi.fn(async () => ({})) }));
vi.mock("@/lib/pdf/payslipExport", () => ({ buildPayslipPdf: vi.fn(async () => Buffer.from("pdf")) }));
vi.mock("@/lib/salary/service", () => ({
  getSalaryStructureForMonth: vi.fn(async () => ({ structure: { agreed_breakup: { basic: 510000 } } })),
  getLatestSalaryStructure: vi.fn(), toCalcInputFromStructure: vi.fn((structure: any) => ({ agreedBreakup: structure.agreed_breakup })),
  applyPayslipProration: vi.fn(),
}));
import { POST } from "@/app/api/cron/payslips-monthly/route";
import { query } from "@/lib/db";
import { getPayrollRunByMonthYear } from "@/lib/hrms/payroll";
import { getSalaryStructureForMonth } from "@/lib/salary/service";
import { toCalcInputFromStructure, applyPayslipProration } from "@/lib/salary/service";
import { buildPayslipPdf } from "@/lib/pdf/payslipExport";
const request = () => new Request("http://localhost/api/cron/payslips-monthly", { method: "POST", headers: { authorization: "Bearer test-secret" }, body: JSON.stringify({ month: 7, year: 2026 }) });
describe("scheduled payslip safeguards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSalaryStructureForMonth).mockResolvedValue({ structure: { agreed_breakup: { basic: 510000 } } } as any);
    vi.stubEnv("CRON_SECRET", "test-secret");
    vi.mocked(getPayrollRunByMonthYear).mockResolvedValue(null);
    vi.mocked(query).mockImplementation(async (sql: string) => ({ rows: sql.includes("SELECT DISTINCT") ? [{ employee_id: 1 }] : [], rowCount: 1 }));
  });
  it("does not overwrite an existing payslip", async () => {
    vi.mocked(query).mockImplementation(async (sql: string) => ({ rows: sql.includes("SELECT DISTINCT") ? [{ employee_id: 1 }] : [{ id: 7 }], rowCount: 1 }));
    expect((await (await POST(request())).json()).generated).toBe(0);
    expect(getSalaryStructureForMonth).not.toHaveBeenCalled();
    expect(vi.mocked(query).mock.calls.every(([sql]) => sql.trim().startsWith("SELECT"))).toBe(true);
  });
  it("reports agreed payslips requiring manual attendance review", async () => {
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ generated: 0, manualReviewRequired: 1 });
    expect(vi.mocked(query).mock.calls.every(([sql]) => sql.trim().startsWith("SELECT"))).toBe(true);
  });
  it("respects locked payroll", async () => {
    vi.mocked(getPayrollRunByMonthYear).mockResolvedValue({ status: "locked" } as any);
    expect((await POST(request())).status).toBe(409);
    expect(query).not.toHaveBeenCalled();
  });
  it("saves current employee identity with a newly scheduled automatic payslip", async () => {
    vi.mocked(getSalaryStructureForMonth).mockResolvedValue({ structure: { id: 4, ctc_annual: 1800000, bank_account_number: "saved-bank" } } as any);
    vi.mocked(toCalcInputFromStructure).mockReturnValue({ taxRegime: "manual_tds" } as any);
    vi.mocked(applyPayslipProration).mockReturnValue({ grossMonthly: 150000, totalDeductions: 15817, earnings: [], deductions: [] } as any);
    vi.mocked(query).mockImplementation(async (sql: string) => ({ rows: sql.includes("SELECT DISTINCT") ? [{ employee_id: 1 }] : sql.includes("FROM users") ? [{ full_name: "Current Name", department: "Product", joining_date: "2026-05-13" }] : sql.includes("INSERT INTO payslips") ? [{ id: 7 }] : [], rowCount: 1 }));
    expect(await (await POST(request())).json()).toMatchObject({ generated: 1, failed: [] });
    expect(buildPayslipPdf).toHaveBeenCalledWith(expect.objectContaining({ employeeName: "Current Name", bankAccountNumber: "saved-bank", netSalary: 134183 }));
    const insert = vi.mocked(query).mock.calls.find(([sql]) => sql.includes("INSERT INTO payslips"))!;
    expect(insert[0]).toContain("employee_snapshot");
    expect(JSON.parse(String(insert[1]![12]))).toMatchObject({ employeeName: "Current Name", department: "Product", bankAccountNumber: "saved-bank", simple: false });
  });
});
