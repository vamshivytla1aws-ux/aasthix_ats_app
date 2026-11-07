import { pool, query } from "@/lib/db";
import { calculateSalaryStructure } from "@/lib/salary/engine";
import type { SalaryCalcInput, SalaryCalcResult, SalaryComponent } from "@/lib/salary/types";
import { writeAuditLog } from "@/lib/auditLog";
import { loadEmployeeSnapshot } from "@/lib/salary/employeeSnapshot";

export async function listSalaryEmployees(employeeId?: number, managerId?: number) {
  const selectWithOptionalColumns = async (withColumns: {
    employee_code: boolean;
    department: boolean;
    designation: boolean;
    joining_date: boolean;
    work_location: boolean;
  }) =>
    query(
      `
      SELECT
        id,
        full_name,
        email,
        role,
        ${withColumns.employee_code ? "COALESCE(employee_code, '')" : "''"} AS employee_code,
        ${withColumns.department ? "COALESCE(department, '')" : "''"} AS department,
        ${withColumns.designation ? "COALESCE(designation, '')" : "''"} AS designation,
        ${withColumns.joining_date ? "joining_date" : "NULL::date"} AS joining_date,
        ${withColumns.work_location ? "COALESCE(work_location, '')" : "''"} AS work_location
      FROM users
      ${employeeId ? "WHERE id = $1" : managerId ? "WHERE reporting_manager_user_id = $1" : ""}
      ORDER BY LOWER(full_name) ASC, id ASC
      `,
      employeeId || managerId ? [employeeId ?? managerId] : [],
    );

  let res;
  try {
    res = await selectWithOptionalColumns({
      employee_code: true,
      department: true,
      designation: true,
      joining_date: true,
      work_location: true,
    });
  } catch {
    res = await selectWithOptionalColumns({
      employee_code: false,
      department: false,
      designation: false,
      joining_date: false,
      work_location: false,
    });
  }

  return res.rows.map((row: any) => ({
    id: Number(row.id),
    full_name: String(row.full_name || ""),
    email: String(row.email || ""),
    role: String(row.role || "user"),
    employee_code: String(row.employee_code || ""),
    department: String(row.department || ""),
    designation: String(row.designation || ""),
    joining_date: row.joining_date ? String(row.joining_date).slice(0, 10) : "",
    work_location: String(row.work_location || ""),
  }));
}

export async function withSalaryTransaction<T>(work: (query: typeof import("@/lib/db").query) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client.query.bind(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createSalaryStructure(input: SalaryCalcInput, actorUserId: number) {
  if (input.agreedBreakup && input.packageReview) throw new Error("Choose one salary calculation.");
  const identity = await loadEmployeeSnapshot(input.employeeId, {});
  input = { ...input, employeeName: identity.employeeName, employeeCode: identity.employeeCode, department: identity.department,
    designation: identity.designation, dateOfJoining: identity.dateOfJoining || null, workLocation: identity.workLocation };
  const calc = await calculateSalaryStructure(input);
  return withSalaryTransaction(async query => {
    // Serialize salary edits for the same employee, including the first save for a month.
    await query("SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE", [input.employeeId]);
    return saveSalaryStructure(query, input, actorUserId, calc);
  });
}

async function saveSalaryStructure(query: typeof import("@/lib/db").query, input: SalaryCalcInput, actorUserId: number, calc: SalaryCalcResult) {
  const structureArgs = [
    input.employeeId,
    input.employeeCode,
    input.department || null,
    input.designation || null,
    input.dateOfJoining || null,
    input.pan || null,
    input.uanNumber || null,
    input.pfNumber || null,
    input.bankAccountNumber || null,
    input.workLocation || null,
    input.ctcAnnual,
    input.salaryMonth,
    input.definedWorkDays,
    input.totalPaidDays,
    input.lopDays,
    input.taxRegime,
    input.manualTdsAnnual == null ? null : Number(input.manualTdsAnnual),
    input.professionalTaxMonthly == null ? 200 : Number(input.professionalTaxMonthly),
    input.pfEnabled,
    input.employerPfIncludedInCtc,
    input.employeePfEnabled,
    input.healthInsuranceEnabled,
    input.healthInsuranceAnnual == null ? 0 : Number(input.healthInsuranceAnnual),
    input.salaryMonth,
    actorUserId,
  ];

  const existingForMonth = await query(
    `
    SELECT id
    FROM salary_structures
    WHERE employee_id = $1::bigint
      AND effective_from = $2::date
    ORDER BY id DESC
    LIMIT 1
    `,
    [input.employeeId, input.salaryMonth],
  );

  let salaryStructureId = 0;
  if (existingForMonth.rowCount > 0) {
    salaryStructureId = Number(existingForMonth.rows[0].id);
    await query(
      `
      UPDATE salary_structures
      SET
        employee_code = $2,
        department = $3,
        designation = $4,
        date_of_joining = $5::date,
        pan = $6,
        uan_number = $7,
        pf_number = $8,
        bank_account_number = $9,
        work_location = $10,
        ctc_annual = $11,
        salary_month = $12::date,
        defined_work_days = $13::int,
        total_paid_days = $14::int,
        lop_days = $15::int,
        tax_regime = $16::text,
        manual_tds_annual = $17::numeric,
        professional_tax_monthly = $18::numeric,
        pf_enabled = $19::boolean,
        employer_pf_included_in_ctc = $20::boolean,
        employee_pf_enabled = $21::boolean,
        health_insurance_enabled = $22::boolean,
        health_insurance_annual = $23::numeric,
        effective_from = $24::date,
        created_by_user_id = $25::bigint,
        updated_at = NOW()
      WHERE id = $26::bigint AND employee_id = $1::bigint
      `,
      [...structureArgs.slice(0, 25), salaryStructureId],
    );
  } else {
    const ins = await query(
      `
      INSERT INTO salary_structures
      (
        employee_id, employee_code, department, designation, date_of_joining, pan, uan_number, pf_number, bank_account_number, work_location,
        ctc_annual, salary_month, defined_work_days, total_paid_days, lop_days, tax_regime, manual_tds_annual, professional_tax_monthly, pf_enabled,
        employer_pf_included_in_ctc, employee_pf_enabled, health_insurance_enabled, health_insurance_annual, effective_from, created_by_user_id, created_at, updated_at
      )
      VALUES
      ($1::bigint,$2::text,$3::text,$4::text,$5::date,$6::text,$7::text,$8::text,$9::text,$10::text,$11::numeric,$12::date,$13::int,$14::int,$15::int,$16::text,$17::numeric,$18::numeric,$19::boolean,$20::boolean,$21::boolean,$22::boolean,$23::numeric,$24::date,$25::bigint,NOW(),NOW())
      RETURNING id
      `,
      structureArgs,
    );
    salaryStructureId = Number(ins.rows[0].id);
  }
  await query(`UPDATE salary_structures SET agreed_breakup = $2::jsonb, package_review = $3::jsonb WHERE id = $1`,
    [salaryStructureId, input.agreedBreakup ? JSON.stringify(input.agreedBreakup) : null,
      input.packageReview ? JSON.stringify(input.packageReview) : null]);
  await replaceSalaryComponents(query, salaryStructureId, calc);
  return { salaryStructureId, calc };
}

async function replaceSalaryComponents(query: typeof import("@/lib/db").query, salaryStructureId: number, calc: SalaryCalcResult) {
  await query(`DELETE FROM salary_components WHERE salary_structure_id = $1`, [salaryStructureId]);
  for (const component of [...calc.earningsAnnual, ...calc.deductionsAnnual]) {
    await query(
      `
      INSERT INTO salary_components
      (salary_structure_id, component_class, name, component_code, calculation_type, percentage_of_ctc, annual_amount, monthly_amount, sort_order, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      `,
      [
        salaryStructureId,
        component.type,
        component.name,
        component.key,
        component.key === "tds" || component.key === "health_insurance" ? "manual" : "formula",
        null,
        component.annual,
        component.monthly,
        component.sortOrder,
      ]
    );
  }
}

export function getLatestSalaryStructure(employeeId: number) {
  return readSalaryStructure(employeeId);
}

export function getSalaryStructureForMonth(employeeId: number, month: number, year: number) {
  return readSalaryStructure(employeeId, `${year}-${String(month).padStart(2, "0")}-01`);
}

async function readSalaryStructure(employeeId: number, monthStart?: string) {
  const result = await query(
    `
    SELECT s.*, s.effective_from::text AS effective_from, s.salary_month::text AS salary_month,
      u.full_name AS employee_name,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'type', c.component_class, 'name', c.name, 'key', COALESCE(c.component_code, ''),
          'annual', c.annual_amount, 'monthly', c.monthly_amount, 'sortOrder', c.sort_order
        ) ORDER BY c.component_class, c.sort_order, c.id)
        FROM salary_components c WHERE c.salary_structure_id = s.id
      ), '[]'::jsonb) AS components
    FROM salary_structures s
    JOIN users u ON u.id = s.employee_id
    WHERE s.employee_id = $1 ${monthStart ? "AND s.effective_from <= $2::date" : ""}
    ORDER BY s.effective_from DESC, s.created_at DESC, s.id DESC
    LIMIT 1
    `,
    monthStart ? [employeeId, monthStart] : [employeeId],
  );
  if (!result.rows[0]) return null;
  const { components, ...structure } = result.rows[0];
  return { structure, components: components as SalaryComponent[] };
}

export function toCalcInputFromStructure(structure: any): SalaryCalcInput {
  return {
    employeeId: Number(structure.employee_id),
    employeeCode: String(structure.employee_code || ""),
    department: structure.department ? String(structure.department) : null,
    designation: structure.designation ? String(structure.designation) : null,
    dateOfJoining: structure.date_of_joining ? String(structure.date_of_joining).slice(0, 10) : null,
    pan: structure.pan ? String(structure.pan) : null,
    uanNumber: structure.uan_number ? String(structure.uan_number) : null,
    pfNumber: structure.pf_number ? String(structure.pf_number) : null,
    bankAccountNumber: structure.bank_account_number ? String(structure.bank_account_number) : null,
    workLocation: structure.work_location ? String(structure.work_location) : null,
    ctcAnnual: Number(structure.ctc_annual || 0),
    salaryMonth: String(structure.salary_month).slice(0, 10),
    definedWorkDays: Number(structure.defined_work_days || structure.total_paid_days || 30),
    totalPaidDays: Number(structure.total_paid_days || 30),
    lopDays: Number(structure.lop_days || 0),
    taxRegime: String(structure.tax_regime || "new_regime") as any,
    manualTdsAnnual: structure.manual_tds_annual == null ? null : Number(structure.manual_tds_annual),
    professionalTaxMonthly: Number(structure.professional_tax_monthly || 200),
    pfEnabled: Boolean(structure.pf_enabled),
    employerPfIncludedInCtc: Boolean(structure.employer_pf_included_in_ctc),
    employeePfEnabled: Boolean(structure.employee_pf_enabled),
    healthInsuranceEnabled: Boolean(structure.health_insurance_enabled),
    healthInsuranceAnnual: Number(structure.health_insurance_annual || 0),
    agreedBreakup: structure.agreed_breakup || null,
    packageReview: structure.package_review || null,
  };
}

export function applyPayslipProration(calc: SalaryCalcResult, paidDays: number, lopDays: number) {
  const days = Math.max(1, Number(paidDays || 0));
  const loss = Math.max(0, Number(lopDays || 0));
  const payable = Math.max(0, days - loss);
  const ratio = Math.max(0, Math.min(1, payable / days));
  const earnings = calc.earningsAnnual.map((item) => ({ ...item, amountForMonth: Math.round(item.monthly * ratio * 100) / 100 }));
  const deductions = calc.deductionsAnnual.map((item) => {
    const proportional = item.key === "tds" || item.key === "employee_pf" ? ratio : 1;
    return { ...item, amountForMonth: Math.round(item.monthly * proportional * 100) / 100 };
  });
  const grossMonthly = Math.round(earnings.reduce((acc, item) => acc + (item.amountForMonth || 0), 0) * 100) / 100;
  const totalDeductions = Math.round(deductions.reduce((acc, item) => acc + (item.amountForMonth || 0), 0) * 100) / 100;
  const net = Math.round((grossMonthly - totalDeductions) * 100) / 100;
  return { ratio, earnings, deductions, grossMonthly, totalDeductions, net };
}

export async function listEmployeeCtcHistory(employeeId: number) {
  const res = await query(
    `
      SELECT
        s.id,
        s.employee_id,
        s.ctc_annual,
        s.salary_month,
        s.effective_from,
        s.created_at,
        s.updated_at,
        s.employee_code,
        s.department,
        s.designation,
        s.work_location
      FROM salary_structures s
      WHERE s.employee_id = $1
      ORDER BY s.effective_from DESC, s.created_at DESC, s.id DESC
    `,
    [employeeId],
  );
  return res.rows.map((row: any) => ({
    id: Number(row.id),
    employee_id: Number(row.employee_id),
    ctc_annual: Number(row.ctc_annual || 0),
    salary_month: row.salary_month ? String(row.salary_month).slice(0, 10) : null,
    effective_from: row.effective_from ? String(row.effective_from).slice(0, 10) : null,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || ""),
    employee_code: String(row.employee_code || ""),
    department: String(row.department || ""),
    designation: String(row.designation || ""),
    work_location: String(row.work_location || ""),
  }));
}

export async function getEmployeeCtcByMonth(employeeId: number, month: number, year: number) {
  return getSalaryStructureForMonth(employeeId, month, year);
}

export async function createCtcVersion(input: SalaryCalcInput, actorUserId: number) {
  const result = await createSalaryStructure(input, actorUserId);
  await writeAuditLog({
    actorUserId,
    action: "hrms.ctc.created",
    metadata: {
      employee_id: input.employeeId,
      ctc_annual: input.ctcAnnual,
      salary_month: input.salaryMonth,
      salary_structure_id: result.salaryStructureId,
    },
  });
  return result;
}

export async function updateCtcVersion(
  id: number,
  updates: { ctcAnnual: number; effectiveFrom?: string | null },
  actorUserId: number,
) {
  const current = await query("SELECT *, effective_from::text AS effective_date, updated_at::text AS updated_version FROM salary_structures WHERE id = $1", [id]);
  const row = current.rows[0];
  if (!row) throw new Error("CTC version not found.");
  if (row.agreed_breakup || row.package_review) throw new Error("Edit the agreed or reviewed breakup in the employee’s Salary & Payslips tab.");
  const effectiveFrom = updates.effectiveFrom || row.effective_date;
  const calc = await calculateSalaryStructure({ ...toCalcInputFromStructure(row), ctcAnnual: updates.ctcAnnual, salaryMonth: effectiveFrom });
  await withSalaryTransaction(async query => {
    const updated = await query(`UPDATE salary_structures SET ctc_annual = $2, effective_from = $3::date, salary_month = $3::date, updated_at = NOW()
      WHERE id = $1 AND updated_at = $4::timestamptz`, [id, updates.ctcAnnual, effectiveFrom, row.updated_version]);
    if (!updated.rowCount) throw new Error("This salary setup changed. Reload it before saving.");
    await replaceSalaryComponents(query, id, calc);
  });
  await writeAuditLog({
    actorUserId,
    action: "hrms.ctc.updated",
    metadata: {
      salary_structure_id: id,
      employee_id: Number(row.employee_id),
      from_ctc: Number(row.ctc_annual || 0),
      to_ctc: Number(updates.ctcAnnual || 0),
      effective_from: effectiveFrom,
    },
  });
}
