import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import bcrypt from "bcryptjs";
import { PDFExtract } from "pdf.js-extract";

const state = vi.hoisted(() => ({ db: null as any, employeeId: 0, access: { user_id: 1, role: "workspace_owner", permissions: {} as Record<string, boolean> } }));
vi.mock("@/lib/db", () => {
  const query = async (sql: string, values?: unknown[]) => {
    const result = await state.db.query(sql, values);
    return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
  };
  return { query, pool: { connect: async () => ({ query, release() {} }) } };
});
vi.mock("@/lib/rbac", async original => ({ ...await original<typeof import("@/lib/rbac")>(),
  getAuthAccess: async () => state.access,
  requirePermission: async (key: string) => state.access.permissions[key] ? { ok: true, access: state.access } : { ok: false, status: 403, error: "Forbidden" },
}));

import { createEmployee, getEmployeeSelfProfile, listEmployees, deactivateEmployee } from "@/lib/hrms/employeeDirectory";
import { getEffectivePermissions } from "@/lib/rbac";
import { getEmployeeSetup } from "@/lib/hrms/employeeSetup";
import { readEmployeeMonth } from "@/lib/hrms/employeeMonth";
import { createSalaryStructure } from "@/lib/salary/service";
import { OFFER_BREAKUP } from "@/lib/salary/agreed";
import { PATCH as updateProfile } from "@/app/api/hrms/employees/[id]/route";
import { POST as setLogin } from "@/app/api/hrms/employees/[id]/login/route";
import { POST as generate } from "@/app/api/payslips/generate/route";
import { GET as download } from "@/app/api/payslips/[id]/download/route";
import { GET as payslipData } from "@/app/api/payslips/[id]/data/route";
import { GET as salarySetup } from "@/app/api/salary-structures/[employeeId]/route";
import { POST as saveSetup } from "@/app/api/salary-structures/route";
import { POST as previewPackage } from "@/app/api/salary-structures/calculate/route";
import { GET as listCorrections, PATCH as closeCorrection, POST as submitCorrection } from "@/app/api/hrms/correction-requests/route";
import { storeEmployeeDocument, listEmployeeDocuments } from "@/lib/hrms/documents";

const employeeInput = { employeeIdCode: "EMP-12", fullName: "Sample Employee", email: "employee@example.test", department: "Engineering", designation: "SDE II", joiningDate: "2026-05-13", status: "active" as const, role: "employee" };
const employeeContext = () => ({ params: { id: String(state.employeeId) } });
const request = (body: unknown) => new Request("http://localhost/test", { method: "POST", body: JSON.stringify(body) });
async function migration(name: string) { await state.db.exec(await readFile(`migrations/${name}`, "utf8")); }
const reviewMigration = "0111_hrms_salary_review_and_corrections.sql";
async function salary(month = "2026-05-01") {
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return createSalaryStructure({ employeeId: state.employeeId, employeeCode: "stale", designation: "Stale job title", ctcAnnual: 1800000,
    salaryMonth: month, definedWorkDays: days, totalPaidDays: days, lopDays: 0, taxRegime: "manual_tds",
    pfEnabled: true, employerPfIncludedInCtc: true, employeePfEnabled: true, healthInsuranceEnabled: false,
    bankAccountNumber: "original-bank", agreedBreakup: OFFER_BREAKUP }, 1);
}

describe("core HRMS with PostgreSQL storage and numbered migrations", () => {
  beforeAll(async () => {
    state.db = new PGlite();
    await state.db.exec(`CREATE TABLE users (id SERIAL PRIMARY KEY, full_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee', password_hash TEXT, is_active BOOLEAN DEFAULT true, token_version INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE app_audit_events (id SERIAL PRIMARY KEY, actor_user_id INTEGER, action TEXT, metadata JSONB);
      CREATE TABLE user_permissions (user_id INTEGER REFERENCES users(id), permission_key TEXT, allowed BOOLEAN);`);
    for (const name of ["0064_employee_attendance.sql", "0073_salary_module.sql", "0074_hrms_leave_module.sql", "0075_hrms_enterprise_modules.sql",
      "0076_payroll_locked_status.sql", "0077_hrms_doc_compliance_payroll_controls.sql", "0078_payslip_tax_sheet_snapshot.sql", "0086_salary_defined_work_days.sql",
      "0104_employee_directory_baseline.sql", "0108_agreed_salary_breakup.sql", "0109_payslip_employee_snapshot.sql", "0110_employee_job_details.sql", reviewMigration]) await migration(name);
  }, 30_000);
  afterAll(async () => { await state.db?.close(); });
  beforeEach(async () => {
    await state.db.exec("TRUNCATE users RESTART IDENTITY CASCADE");
    await state.db.query("INSERT INTO users (full_name,email,role) VALUES ('Sample HR','hr@example.test','workspace_owner')");
    state.access = { user_id: 1, role: "workspace_owner", permissions: getEffectivePermissions("workspace_owner", new Map()) };
    state.employeeId = await createEmployee(employeeInput, 1);
  });

  it("saves designation through the API, reads it in the directory/profile/setup, and sets a joining-date password", async () => {
    const response = await updateProfile(request({ designation: "Technical Lead", department: "Product", phone: "" }), employeeContext());
    expect(response.status).toBe(200);
    expect(await getEmployeeSelfProfile(state.employeeId)).toMatchObject({ designation: "Technical Lead", department: "Product", phone: "" });
    expect((await listEmployees({ actorUserId: 1, role: "workspace_owner" })).find((row: Record<string, unknown>) => row.id === state.employeeId)).toMatchObject({ designation: "Technical Lead", department: "Product" });
    expect((await getEmployeeSetup(state.employeeId, state.access as any))?.items.find(item => item.key === "details")?.status).toBe("complete");
    expect((await setLogin(request({ joiningDate: "2026-05-13" }), employeeContext())).status).toBe(200);
    const user = (await state.db.query("SELECT password_hash, token_version FROM users WHERE id=$1", [state.employeeId])).rows[0];
    expect(await bcrypt.compare("13052026", user.password_hash)).toBe(true);
    expect(user.token_version).toBe(2);
  });

  it("generates the agreed payments and keeps historical employee details and PDF bytes after later edits", async () => {
    await salary();
    let originalId = 0;
    for (const [month, paidDays, lopDays, actualNetPaid, expected] of [[5, 14, 1, 60598, 60598], [6, 30, 0, undefined, 134183], [7, 31, 1, undefined, 129854], [8, 31, 0, undefined, 134183], [10, 31, 0, undefined, 134183], [11, 30, 0, undefined, 134183]]) {
      const response = await generate(request({ employeeId: state.employeeId, year: 2026, month, paidDays, lopDays, actualNetPaid }));
      const result = await response.json();
      expect(response.status, JSON.stringify(result)).toBe(200);
      expect(result.netSalary).toBe(expected);
      if (month === 5) originalId = result.payslipId;
    }
    const context = { params: { id: String(originalId) } };
    const original = Buffer.from(await (await download(request({}), context)).arrayBuffer());
    expect(original.subarray(0, 4).toString()).toBe("%PDF");
    expect((await updateProfile(request({ designation: "Technical Lead", fullName: "Updated Name" }), employeeContext())).status).toBe(200);
    await state.db.query("UPDATE salary_structures SET bank_account_number='new-bank' WHERE employee_id=$1", [state.employeeId]);
    expect(Buffer.from(await (await download(request({}), context)).arrayBuffer())).toEqual(original);
    expect((await (await payslipData(request({}), context)).json()).data).toMatchObject({ designation: "SDE II", employeeName: "Sample Employee", bankAccountNumber: "original-bank" });
    // Reapplying nullable migrations never invents legacy identity or changes stored documents.
    await state.db.query("UPDATE payslips SET employee_snapshot=NULL WHERE id=$1", [originalId]);
    for (let i = 0; i < 2; i++) for (const name of ["0108_agreed_salary_breakup.sql", "0109_payslip_employee_snapshot.sql", "0110_employee_job_details.sql", reviewMigration]) await migration(name);
    expect((await state.db.query("SELECT employee_snapshot FROM payslips WHERE id=$1", [originalId])).rows[0].employee_snapshot).toBeNull();
    expect(Buffer.from(await (await download(request({}), context)).arrayBuffer())).toEqual(original);
    expect((await getEmployeeSelfProfile(state.employeeId))?.designation).toBe("Technical Lead");
  }, 20_000);

  it("reads real monthly attendance and overlapping leave without creating absence or accrual records", async () => {
    await state.db.query("INSERT INTO attendance_records (user_id,attendance_date,status,total_minutes) VALUES ($1,'2026-05-14','present',480)", [state.employeeId]);
    await state.db.query("INSERT INTO leave_requests (user_id,manager_user_id,leave_type,from_date,to_date,total_days,paid_days,status) VALUES ($1,1,'casual','2026-04-29','2026-05-02',4,4,'approved')", [state.employeeId]);
    const result = await readEmployeeMonth(state.access as any, state.employeeId, "2026-05");
    expect(result.status).toBe(200);
    expect(result.data?.attendance).toMatchObject({ totals: { present: 1, absent: 0, notRecorded: 30 } });
    expect(result.data?.leave.requests).toHaveLength(1);
    expect((await readEmployeeMonth(state.access as any, state.employeeId, "2026-07")).data?.attendance).toMatchObject({ totals: { present: 0, absent: 0, notRecorded: 31 } });
    expect((await state.db.query("SELECT count(*)::int AS n FROM attendance_records")).rows[0].n).toBe(1);
    expect((await state.db.query("SELECT count(*)::int AS n FROM employee_leave_balances")).rows[0].n).toBe(0);
  });

  it("retains documents and payslips when deactivated and reactivated", async () => {
    await salary();
    expect((await generate(request({ employeeId: state.employeeId, year: 2026, month: 6, paidDays: 30, lopDays: 0 }))).status).toBe(200);
    await storeEmployeeDocument({ employeeId: state.employeeId, category: "offer_letter", fileName: "offer.pdf", fileType: "application/pdf", fileSize: 4, fileBuffer: Buffer.from("test"), uploadedByUserId: 1 });
    await deactivateEmployee(state.employeeId, 1);
    expect((await setLogin(request({}), employeeContext())).status).toBe(409);
    expect((await updateProfile(request({ status: "active" }), employeeContext())).status).toBe(200);
    expect((await getEmployeeSelfProfile(state.employeeId))?.employment_status).toBe("active");
    expect(await listEmployeeDocuments({ actorUserId: state.employeeId, role: "employee" })).toHaveLength(1);
    expect((await state.db.query("SELECT count(*)::int AS n FROM payslips WHERE employee_id=$1", [state.employeeId])).rows[0].n).toBe(1);
  });

  it("keeps the reporting manager and leave approval mapping in sync, including optional clearing", async () => {
    // Existing approval routing is not erased by an unrelated job-title edit.
    await state.db.query("INSERT INTO employee_manager_map (user_id,manager_user_id) VALUES ($1,1)", [state.employeeId]);
    expect((await updateProfile(request({ designation: "Updated title", reportingManagerEmail: "" }), employeeContext())).status).toBe(200);
    expect((await state.db.query("SELECT manager_user_id FROM employee_manager_map WHERE user_id=$1", [state.employeeId])).rows[0].manager_user_id).toBe(1);
    const created = await createEmployee({ ...employeeInput, employeeIdCode: "EMP-13", email: "new@example.test", reportingManagerEmail: "hr@example.test" }, 1);
    expect((await state.db.query("SELECT manager_user_id FROM employee_manager_map WHERE user_id=$1", [created])).rows[0].manager_user_id).toBe(1);
    expect((await updateProfile(request({ reportingManagerEmail: "hr@example.test" }), employeeContext())).status).toBe(200);
    expect((await getEmployeeSelfProfile(state.employeeId))?.reporting_manager_email).toBe("hr@example.test");
    expect((await state.db.query("SELECT manager_user_id FROM employee_manager_map WHERE user_id=$1", [state.employeeId])).rows[0].manager_user_id).toBe(1);
    expect((await updateProfile(request({ reportingManagerEmail: employeeInput.email }), employeeContext())).status).toBe(400);
    expect((await state.db.query("SELECT manager_user_id FROM employee_manager_map WHERE user_id=$1", [state.employeeId])).rows[0].manager_user_id).toBe(1);
    expect((await updateProfile(request({ reportingManagerEmail: "" }), employeeContext())).status).toBe(200);
    expect((await getEmployeeSelfProfile(state.employeeId))?.reporting_manager_user_id).toBeNull();
    expect((await state.db.query("SELECT * FROM employee_manager_map WHERE user_id=$1", [state.employeeId])).rows).toHaveLength(0);
  });

  it("shows the effective October setup when the newest November setup is different, and saves the older month correctly", async () => {
    await createSalaryStructure({ employeeId: state.employeeId, employeeCode: "EMP-12", ctcAnnual: 1800000,
      salaryMonth: "2026-10-01", definedWorkDays: 31, totalPaidDays: 31, lopDays: 0, taxRegime: "manual_tds", manualTdsAnnual: 150800,
      pfEnabled: true, employerPfIncludedInCtc: true, employeePfEnabled: true, healthInsuranceEnabled: false }, 1);
    const november = await salary("2026-11-01");
    const context = { params: { employeeId: String(state.employeeId) } };
    const read = (month?: string) => salarySetup(new Request(`http://localhost/api/salary-structures/${state.employeeId}${month ? `?month=${month}` : ""}`), context);
    expect((await (await read("2026-10")).json()).structure.agreed_breakup).toBeNull();
    expect((await (await read("2026-11")).json()).structure.agreed_breakup).toEqual(OFFER_BREAKUP);
    expect((await (await generate(request({ employeeId: state.employeeId, year: 2026, month: 10, paidDays: 31, lopDays: 0, preview: true }))).json()).calculation.netMonthlySalary).toBe(135433.33);
    await salary("2026-10-01");
    expect(Number((await (await read()).json()).structure.id)).toBe(november.salaryStructureId);
    expect((await (await read("2026-10")).json()).structure.agreed_breakup).toEqual(OFFER_BREAKUP);
    expect((await (await generate(request({ employeeId: state.employeeId, year: 2026, month: 10, paidDays: 31, lopDays: 0, preview: true }))).json()).calculation.netMonthlySalary).toBe(134183);
  });

  it("estimates without saving and only suggests tax for a verified year and regime", async () => {
    const input = { employeeId: state.employeeId, ctcAnnual: 1800000, salaryMonth: "2026-11", packageEstimate: true,
      packageReview: { employerPfInCtc: true, employerPf: 1800, employeePf: 1800, professionalTax: 200, regime: "new_regime" } };
    const estimate = await (await previewPackage(request(input))).json();
    expect(estimate).toMatchObject({ financialYear: "FY 2026-27", suggestedTds: null, estimate: { cashGross: 148200, net: null } });
    const outside = await (await previewPackage(request({ ...input, packageReview: { ...input.packageReview, employerPfInCtc: false, tds: 0 } }))).json();
    expect(outside.estimate).toMatchObject({ cashGross: 150000, totalEmployerCost: 151800, totalDeductions: 2000, net: 148000 });
    const config = (await state.db.query(`INSERT INTO tax_configs (financial_year, regime, is_active, cess_percent, payroll_verified_at)
      VALUES ('FY 2026-27','new_regime',true,0,NOW()) RETURNING id`)).rows[0];
    try {
      await state.db.query("INSERT INTO tax_slabs (tax_config_id,min_amount,rate_percent) VALUES ($1,0,10)", [config.id]);
      expect((await (await previewPackage(request(input))).json()).suggestedTds).toBe(14820.01);
      expect((await (await previewPackage(request({ ...input, packageReview: { ...input.packageReview, regime: "old_regime" } }))).json()).suggestedTds).toBeNull();
      expect((await (await previewPackage(request({ ...input, salaryMonth: "2026-03" }))).json()).suggestedTds).toBeNull();
    } finally { await state.db.query("DELETE FROM tax_configs WHERE id=$1", [config.id]); }
    expect((await state.db.query("SELECT * FROM salary_structures")).rows).toHaveLength(0);
  });

  it("saves a reviewed package with explicit zero, uses the same preview and generated PDF totals, and masks the overview", async () => {
    const input = { employeeId: state.employeeId, ctcAnnual: 1800000, salaryMonth: "2026-11-01", confirmPackage: true,
      pan: "ABCDE1234F", bankAccountNumber: "123456789012",
      packageReview: { employerPfInCtc: true, employerPf: 1800, employeePf: 0, professionalTax: 0, tds: 0, regime: "manual_tds" } };
    expect((await saveSetup(request({ ...input, confirmPackage: false }))).status).toBe(400);
    expect((await saveSetup(request({ ...input, packageReview: { ...input.packageReview, tds: undefined } }))).status).toBe(400);
    const saved = await saveSetup(request(input));
    const savedBody = await saved.json();
    expect(saved.status, JSON.stringify(savedBody)).toBe(200);
    expect(savedBody.calculation.netMonthlySalary).toBe(148200);
    const pay = { employeeId: state.employeeId, year: 2026, month: 11, paidDays: 30, lopDays: 0 };
    expect((await generate(request({ ...pay, month: 10, paidDays: 31, preview: true }))).status).toBe(404);
    const preview = (await (await generate(request({ ...pay, preview: true }))).json()).calculation;
    expect(preview).toMatchObject({ netMonthlySalary: 148200, totalMonthlyDeductions: 0, grossMonthlySalary: 148200 });
    const generated = await (await generate(request(pay))).json();
    expect(generated.netSalary).toBe(preview.netMonthlySalary);
    const context = { params: { id: String(generated.payslipId) } };
    const pdf = Buffer.from(await (await download(request({}), context)).arrayBuffer());
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const contents = await new PDFExtract().extractBuffer(pdf, {});
    expect(contents.pages.flatMap(page => page.content.map(line => line.str)).join(" ")).toContain("NET PAY: Rs. 1,48,200.00");
    expect((await (await payslipData(request({}), context)).json()).data.calculation.netMonthlySalary).toBe(preview.netMonthlySalary);
    await state.db.query("INSERT INTO payroll_runs (month,year,status) VALUES (11,2026,'locked')");
    expect((await saveSetup(request(input))).status).toBe(409);
    expect((await generate(request(pay))).status).toBe(409);
    state.access = { role: "employee", user_id: state.employeeId, permissions: { "salary.view": true } };
    const response = await salarySetup(new Request("http://localhost/test?month=2026-11"), { params: { employeeId: String(state.employeeId) } });
    const overview = await response.json();
    expect(overview.structure).toMatchObject({ mode: "Reviewed package", bank_account_number: "••••9012", pan: "••••234F", employer_pf: 1800 });
    expect(overview.components).toHaveLength(8);
    expect(JSON.stringify(overview)).not.toContain(input.bankAccountNumber);
    expect(Buffer.from(await (await download(request({}), context)).arrayBuffer())).toEqual(pdf);
  });

  it("keeps correction submission, viewing and resolution scoped to the employee and permitted staff", async () => {
    const employee = { role: "employee", user_id: state.employeeId, permissions: { "employee_directory.view_self": true, "salary.view": true } };
    state.access = employee;
    const payload = { category: "profile", subject: "Designation", description: "Please review my title." };
    expect((await submitCorrection(request({ ...payload, employeeId: 1 }))).status).toBe(403);
    expect((await submitCorrection(request({ category: "payslip", subject: "2026-11", description: "Check deductions." }))).status).toBe(400);
    const result = await submitCorrection(request(payload));
    expect(result.status).toBe(201);
    const row = (await result.json()).request;
    const filter = new Request(`http://localhost/test?category=profile&employeeId=${state.employeeId}`);
    const closing = { employeeId: state.employeeId, id: Number(row.id), category: "profile", status: "resolved", note: "Reviewed with HR." };
    expect((await listCorrections(new Request("http://localhost/test?category=profile&employeeId=1"))).status).toBe(403);
    expect((await closeCorrection(request(closing))).status).toBe(403);
    expect((await listCorrections(filter)).status).toBe(200);
    state.access = { role: "manager", user_id: 1, permissions: { "employee_directory.view_all": true, "employee_directory.manage": true, "salary.view": true, "salary.manage": true } };
    expect((await listCorrections(filter)).status).toBe(403);
    expect((await closeCorrection(request(closing))).status).toBe(403);
    expect((await salarySetup(new Request("http://localhost/test"), { params: { employeeId: String(state.employeeId) } })).status).toBe(403);
    await state.db.query("UPDATE users SET reporting_manager_user_id=1 WHERE id=$1", [state.employeeId]);
    expect((await listCorrections(filter)).status).toBe(200);
    expect((await closeCorrection(request(closing))).status).toBe(200);
    expect((await closeCorrection(request(closing))).status).toBe(409);
    expect((await getEmployeeSelfProfile(state.employeeId))?.designation).toBe("SDE II");
    state.access = employee;
    expect((await (await listCorrections(filter)).json()).requests[0]).toMatchObject({ status: "resolved", resolution_note: closing.note });
    state.access = { ...employee, permissions: {} };
    expect((await listCorrections(filter)).status).toBe(403);
    expect((await submitCorrection(request(payload))).status).toBe(403);
  });
});
