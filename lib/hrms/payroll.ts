import { query } from "@/lib/db";
import { writeAuditLog } from "@/lib/auditLog";

export async function listPayrollRuns() {
  const res = await query(
    `
      SELECT
        r.*,
        COALESCE(g.full_name, '') AS generated_by_name,
        COALESCE(a.full_name, '') AS approved_by_name
      FROM payroll_runs r
      LEFT JOIN users g ON g.id = r.generated_by_user_id
      LEFT JOIN users a ON a.id = r.approved_by_user_id
      ORDER BY r.year DESC, r.month DESC, r.id DESC
    `,
    [],
  );
  return res.rows;
}

export async function createOrUpdatePayrollRun(input: {
  month: number;
  year: number;
  status?: "draft" | "generated" | "approved";
  notes?: string | null;
  actorUserId: number;
}) {
  const status = input.status || "generated";
  const upsert = await query(
    `
      INSERT INTO payroll_runs
      (month, year, status, generated_by_user_id, generated_at, notes, created_at, updated_at)
      VALUES ($1,$2,$3,$4,NOW(),$5,NOW(),NOW())
      ON CONFLICT (month, year)
      DO UPDATE SET
        status = EXCLUDED.status,
        generated_by_user_id = EXCLUDED.generated_by_user_id,
        generated_at = NOW(),
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING id
    `,
    [input.month, input.year, status, input.actorUserId, input.notes || null],
  );
  const id = Number(upsert.rows[0]?.id || 0);
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "hrms.payroll.run.generated",
    metadata: { payroll_run_id: id, month: input.month, year: input.year, status },
  });
  return id;
}

export async function approvePayrollRun(id: number, actorUserId: number) {
  await query(
    `
      UPDATE payroll_runs
      SET status = 'approved', approved_by_user_id = $2, approved_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `,
    [id, actorUserId],
  );
  await writeAuditLog({
    actorUserId,
    action: "hrms.payroll.run.approved",
    metadata: { payroll_run_id: id },
  });
}

export async function listPayrollHistoryForEmployee(employeeId: number) {
  const res = await query(
    `
      SELECT
        p.id,
        p.month,
        p.year,
        p.gross_monthly,
        p.total_deductions,
        p.net_salary,
        p.generated_at
      FROM payslips p
      WHERE p.employee_id = $1
      ORDER BY p.year DESC, p.month DESC, p.generated_at DESC
    `,
    [employeeId],
  );
  return res.rows;
}
