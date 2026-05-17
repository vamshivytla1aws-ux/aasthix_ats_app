import { query } from "@/lib/db";
import { calculateSalaryStructure } from "@/lib/salary/engine";
import type { SalaryCalcInput, SalaryCalcResult } from "@/lib/salary/types";

export async function listSalaryEmployees() {
  const res = await query(
    `SELECT id, full_name, email, role FROM users ORDER BY LOWER(full_name) ASC, id ASC`,
    []
  );
  return res.rows.map((row: any) => ({
    id: Number(row.id),
    full_name: String(row.full_name || ""),
    email: String(row.email || ""),
    role: String(row.role || "user"),
  }));
}

export async function createSalaryStructure(input: SalaryCalcInput, actorUserId: number) {
  const calc = await calculateSalaryStructure(input);
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
    WHERE employee_id = $1
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
        total_paid_days = $13,
        lop_days = $14,
        tax_regime = $15,
        manual_tds_annual = $16,
        professional_tax_monthly = $17,
        pf_enabled = $18,
        employer_pf_included_in_ctc = $19,
        employee_pf_enabled = $20,
        health_insurance_enabled = $21,
        health_insurance_annual = $22,
        effective_from = $23::date,
        created_by_user_id = $24,
        updated_at = NOW()
      WHERE id = $25
      `,
      [...structureArgs.slice(0, 24), salaryStructureId],
    );
    await query(`DELETE FROM salary_components WHERE salary_structure_id = $1`, [salaryStructureId]);
  } else {
    const ins = await query(
      `
      INSERT INTO salary_structures
      (
        employee_id, employee_code, department, designation, date_of_joining, pan, uan_number, pf_number, bank_account_number, work_location,
        ctc_annual, salary_month, total_paid_days, lop_days, tax_regime, manual_tds_annual, professional_tax_monthly, pf_enabled,
        employer_pf_included_in_ctc, employee_pf_enabled, health_insurance_enabled, health_insurance_annual, effective_from, created_by_user_id, created_at, updated_at
      )
      VALUES
      ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11,$12::date,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::date,$24,NOW(),NOW())
      RETURNING id
      `,
      structureArgs,
    );
    salaryStructureId = Number(ins.rows[0].id);
  }
  const allComponents = [...calc.earningsAnnual, ...calc.deductionsAnnual];
  for (const component of allComponents) {
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
        component.key === "tds" || component.key === "health_insurance" ? "manual" : component.key === "other_allowance" ? "formula" : "formula",
        null,
        component.annual,
        component.monthly,
        component.sortOrder,
      ]
    );
  }
  return { salaryStructureId, calc };
}

export async function getLatestSalaryStructure(employeeId: number) {
  const res = await query(
    `
    SELECT s.*, u.full_name AS employee_name
    FROM salary_structures s
    JOIN users u ON u.id = s.employee_id
    WHERE s.employee_id = $1
    ORDER BY s.effective_from DESC, s.created_at DESC, s.id DESC
    LIMIT 1
    `,
    [employeeId]
  );
  if (res.rowCount === 0) return null;
  const structure = res.rows[0] as any;
  const componentsRes = await query(
    `
    SELECT component_class, name, component_code, annual_amount, monthly_amount, sort_order
    FROM salary_components
    WHERE salary_structure_id = $1
    ORDER BY component_class ASC, sort_order ASC, id ASC
    `,
    [Number(structure.id)]
  );
  return {
    structure,
    components: componentsRes.rows.map((row: any) => ({
      type: String(row.component_class) as "earning" | "deduction",
      name: String(row.name || ""),
      key: String(row.component_code || ""),
      annual: Number(row.annual_amount || 0),
      monthly: Number(row.monthly_amount || 0),
      sortOrder: Number(row.sort_order || 100),
    })),
  };
}

export async function getSalaryStructureForMonth(employeeId: number, month: number, year: number) {
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const res = await query(
    `
    SELECT s.*, u.full_name AS employee_name
    FROM salary_structures s
    JOIN users u ON u.id = s.employee_id
    WHERE s.employee_id = $1
      AND s.effective_from <= $2::date
    ORDER BY s.effective_from DESC, s.created_at DESC, s.id DESC
    LIMIT 1
    `,
    [employeeId, monthStart],
  );
  if (res.rowCount === 0) return null;
  const structure = res.rows[0] as any;
  const componentsRes = await query(
    `
    SELECT component_class, name, component_code, annual_amount, monthly_amount, sort_order
    FROM salary_components
    WHERE salary_structure_id = $1
    ORDER BY component_class ASC, sort_order ASC, id ASC
    `,
    [Number(structure.id)]
  );
  return {
    structure,
    components: componentsRes.rows.map((row: any) => ({
      type: String(row.component_class) as "earning" | "deduction",
      name: String(row.name || ""),
      key: String(row.component_code || ""),
      annual: Number(row.annual_amount || 0),
      monthly: Number(row.monthly_amount || 0),
      sortOrder: Number(row.sort_order || 100),
    })),
  };
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
