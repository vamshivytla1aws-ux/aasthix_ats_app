import { query } from "@/lib/db";
import { writeAuditLog } from "@/lib/auditLog";

export async function listPayrollRuns() {
  const res = await query(
    `
      SELECT
        r.*,
        COALESCE(g.full_name, '') AS generated_by_name,
        COALESCE(a.full_name, '') AS approved_by_name,
        COALESCE(l.full_name, '') AS locked_by_name,
        COALESCE(u.full_name, '') AS unlocked_by_name
      FROM payroll_runs r
      LEFT JOIN users g ON g.id = r.generated_by_user_id
      LEFT JOIN users a ON a.id = r.approved_by_user_id
      LEFT JOIN users l ON l.id = r.locked_by_user_id
      LEFT JOIN users u ON u.id = r.unlocked_by_user_id
      ORDER BY r.year DESC, r.month DESC, r.id DESC
    `,
    [],
  );
  return res.rows;
}

export async function createOrUpdatePayrollRun(input: {
  month: number;
  year: number;
  status?: "draft" | "generated" | "approved" | "locked";
  notes?: string | null;
  actorUserId: number;
}) {
  const status = input.status || "generated";
  const existing = await query(
    `SELECT id, status, generated_by_user_id, approved_by_user_id FROM payroll_runs WHERE month = $1 AND year = $2 LIMIT 1`,
    [input.month, input.year],
  );
  const existingRun = existing.rows[0] as
    | { id: number; status: string; generated_by_user_id: number | null; approved_by_user_id: number | null }
    | undefined;
  if (existingRun?.status === "locked") {
    await writeAuditLog({
      actorUserId: input.actorUserId,
      action: "hrms.payroll.run.generate_blocked_locked",
      metadata: { payroll_run_id: existingRun.id, month: input.month, year: input.year },
    });
    const error = new Error("Payroll month is locked. Unlock before generating again.");
    (error as Error & { code?: string }).code = "PAYROLL_LOCKED";
    throw error;
  }
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
  const existing = await query(
    `SELECT generated_by_user_id, status FROM payroll_runs WHERE id = $1 LIMIT 1`,
    [id],
  );
  if (existing.rowCount === 0) {
    const error = new Error("Payroll run not found.");
    (error as Error & { code?: string }).code = "PAYROLL_NOT_FOUND";
    throw error;
  }
  const row = existing.rows[0] as { generated_by_user_id: number | null; status: string };
  if (row.status === "locked") {
    await writeAuditLog({
      actorUserId,
      action: "hrms.payroll.run.approve_blocked_locked",
      metadata: { payroll_run_id: id },
    });
    const error = new Error("Payroll run is already locked.");
    (error as Error & { code?: string }).code = "PAYROLL_LOCKED";
    throw error;
  }
  if (row.generated_by_user_id && Number(row.generated_by_user_id) === actorUserId) {
    await writeAuditLog({
      actorUserId,
      action: "hrms.payroll.run.approve_blocked_maker_checker",
      metadata: { payroll_run_id: id },
    });
    const error = new Error("Maker-checker violation: generator cannot approve the same payroll run.");
    (error as Error & { code?: string }).code = "MAKER_CHECKER_BLOCKED";
    throw error;
  }
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

export async function lockPayrollRun(id: number, actorUserId: number) {
  const existing = await query(
    `SELECT status FROM payroll_runs WHERE id = $1 LIMIT 1`,
    [id],
  );
  if (existing.rowCount === 0) {
    const error = new Error("Payroll run not found.");
    (error as Error & { code?: string }).code = "PAYROLL_NOT_FOUND";
    throw error;
  }
  const status = String(existing.rows[0]?.status || "draft");
  if (status !== "approved") {
    await writeAuditLog({
      actorUserId,
      action: "hrms.payroll.run.lock_blocked_not_approved",
      metadata: { payroll_run_id: id, status },
    });
    const error = new Error("Only approved payroll runs can be locked.");
    (error as Error & { code?: string }).code = "PAYROLL_NOT_APPROVED";
    throw error;
  }
  await query(
    `
      UPDATE payroll_runs
      SET status = 'locked', locked_by_user_id = $2, locked_at = NOW(), updated_at = NOW()
      WHERE id = $1
    `,
    [id, actorUserId],
  );
  await writeAuditLog({
    actorUserId,
    action: "hrms.payroll.run.locked",
    metadata: { payroll_run_id: id },
  });
}

export async function unlockPayrollRun(id: number, actorUserId: number, reason: string) {
  const existing = await query(
    `SELECT status FROM payroll_runs WHERE id = $1 LIMIT 1`,
    [id],
  );
  if (existing.rowCount === 0) {
    const error = new Error("Payroll run not found.");
    (error as Error & { code?: string }).code = "PAYROLL_NOT_FOUND";
    throw error;
  }
  const status = String(existing.rows[0]?.status || "draft");
  if (status !== "locked") {
    const error = new Error("Only locked payroll runs can be unlocked.");
    (error as Error & { code?: string }).code = "PAYROLL_NOT_LOCKED";
    throw error;
  }
  await query(
    `
      UPDATE payroll_runs
      SET
        status = 'approved',
        unlocked_by_user_id = $2,
        unlocked_at = NOW(),
        unlock_reason = $3,
        updated_at = NOW()
      WHERE id = $1
    `,
    [id, actorUserId, reason.trim()],
  );
  await writeAuditLog({
    actorUserId,
    action: "hrms.payroll.run.unlocked",
    metadata: { payroll_run_id: id, reason: reason.trim() },
  });
}

export async function getPayrollRunByMonthYear(month: number, year: number) {
  const res = await query(
    `SELECT id, status FROM payroll_runs WHERE month = $1 AND year = $2 LIMIT 1`,
    [month, year],
  );
  return (res.rows[0] as { id: number; status: string } | undefined) || null;
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

export async function listPayrollVariance(month: number, year: number) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const res = await query(
    `
      SELECT
        curr.employee_id,
        COALESCE(u.full_name, '') AS employee_name,
        curr.gross_monthly AS gross_current,
        curr.total_deductions AS deductions_current,
        curr.net_salary AS net_current,
        prev.gross_monthly AS gross_previous,
        prev.total_deductions AS deductions_previous,
        prev.net_salary AS net_previous
      FROM payslips curr
      JOIN users u ON u.id = curr.employee_id
      LEFT JOIN payslips prev
        ON prev.employee_id = curr.employee_id
       AND prev.month = $3
       AND prev.year = $4
      WHERE curr.month = $1 AND curr.year = $2
      ORDER BY LOWER(u.full_name) ASC, curr.employee_id ASC
    `,
    [month, year, prevMonth, prevYear],
  );
  return res.rows.map((row: any) => {
    const grossPrev = Number(row.gross_previous || 0);
    const dedPrev = Number(row.deductions_previous || 0);
    const netPrev = Number(row.net_previous || 0);
    const grossCurr = Number(row.gross_current || 0);
    const dedCurr = Number(row.deductions_current || 0);
    const netCurr = Number(row.net_current || 0);
    return {
      employee_id: Number(row.employee_id),
      employee_name: String(row.employee_name || ""),
      gross_current: grossCurr,
      gross_previous: grossPrev,
      gross_delta: Math.round((grossCurr - grossPrev) * 100) / 100,
      deductions_current: dedCurr,
      deductions_previous: dedPrev,
      deductions_delta: Math.round((dedCurr - dedPrev) * 100) / 100,
      net_current: netCurr,
      net_previous: netPrev,
      net_delta: Math.round((netCurr - netPrev) * 100) / 100,
    };
  });
}
