import { query } from "@/lib/db";

export type LeaveType = "sick" | "casual";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

type LeavePolicy = {
  sick_accrual_monthly: number;
  casual_accrual_monthly: number;
  sick_carry_forward_cap: number;
  casual_carry_forward_cap: number;
};

function toIsoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function monthStart(value: Date | string) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function monthsBetweenInclusive(fromMonthStart: Date, toMonthStart: Date) {
  let count = 0;
  let cursor = new Date(Date.UTC(fromMonthStart.getUTCFullYear(), fromMonthStart.getUTCMonth(), 1));
  while (cursor <= toMonthStart) {
    count += 1;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return count;
}

function isWeekend(date: Date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

async function getPolicy(): Promise<LeavePolicy> {
  const res = await query(
    `SELECT sick_accrual_monthly, casual_accrual_monthly, sick_carry_forward_cap, casual_carry_forward_cap
     FROM leave_policies WHERE id = 1 LIMIT 1`,
    [],
  );
  const row = (res.rows[0] || {}) as Record<string, unknown>;
  return {
    sick_accrual_monthly: Number(row.sick_accrual_monthly || 1),
    casual_accrual_monthly: Number(row.casual_accrual_monthly || 1),
    sick_carry_forward_cap: Number(row.sick_carry_forward_cap || 12),
    casual_carry_forward_cap: Number(row.casual_carry_forward_cap || 12),
  };
}

export async function listHolidays() {
  const res = await query(
    `SELECT id, holiday_date, holiday_name, location_scope, created_at
     FROM holiday_calendar ORDER BY holiday_date ASC, id ASC`,
    [],
  );
  return res.rows;
}

async function getHolidaySet(fromDate: string, toDate: string) {
  const res = await query(
    `SELECT holiday_date FROM holiday_calendar WHERE holiday_date BETWEEN $1::date AND $2::date`,
    [fromDate, toDate],
  );
  return new Set<string>(res.rows.map((row: any) => String(row.holiday_date).slice(0, 10)));
}

function countChargeableDays(fromDate: string, toDate: string, holidaySet: Set<string>) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  let total = 0;
  for (let cursor = new Date(from); cursor <= to; cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)) {
    const key = cursor.toISOString().slice(0, 10);
    if (isWeekend(cursor)) continue;
    if (holidaySet.has(key)) continue;
    total += 1;
  }
  return total;
}

async function ensureBalanceRows(userId: number) {
  await query(
    `INSERT INTO employee_leave_balances (user_id, leave_type) VALUES ($1, 'sick') ON CONFLICT (user_id, leave_type) DO NOTHING`,
    [userId],
  );
  await query(
    `INSERT INTO employee_leave_balances (user_id, leave_type) VALUES ($1, 'casual') ON CONFLICT (user_id, leave_type) DO NOTHING`,
    [userId],
  );
}

export async function ensureAccrual(userId: number, asOfDate: string) {
  await ensureBalanceRows(userId);
  const policy = await getPolicy();
  const asOfMonth = monthStart(asOfDate);
  const balancesRes = await query(
    `SELECT id, leave_type, accrued_days, used_days, opening_days, last_accrual_month
     FROM employee_leave_balances
     WHERE user_id = $1
     ORDER BY leave_type ASC`,
    [userId],
  );

  for (const row of balancesRes.rows as any[]) {
    const leaveType = String(row.leave_type) as LeaveType;
    const accrualMonthly = leaveType === "sick" ? policy.sick_accrual_monthly : policy.casual_accrual_monthly;
    const cap = leaveType === "sick" ? policy.sick_carry_forward_cap : policy.casual_carry_forward_cap;
    const accruedDays = Number(row.accrued_days || 0);
    const openingDays = Number(row.opening_days || 0);
    const usedDays = Number(row.used_days || 0);
    const lastAccrualMonth = row.last_accrual_month
      ? monthStart(String(row.last_accrual_month))
      : monthStart(asOfMonth);
    const startAccrualFrom = row.last_accrual_month
      ? new Date(Date.UTC(lastAccrualMonth.getUTCFullYear(), lastAccrualMonth.getUTCMonth() + 1, 1))
      : asOfMonth;
    const monthsToAccrue = startAccrualFrom <= asOfMonth ? monthsBetweenInclusive(startAccrualFrom, asOfMonth) : 0;
    if (monthsToAccrue <= 0) continue;

    const nextAccrued = Math.min(cap, accruedDays + monthsToAccrue * accrualMonthly);
    await query(
      `UPDATE employee_leave_balances
       SET accrued_days = $2, last_accrual_month = $3::date, updated_at = NOW()
       WHERE id = $1`,
      [Number(row.id), nextAccrued, toIsoDate(asOfMonth)],
    );
    // Prevent unused variable warnings in strict builds for future extension.
    void openingDays;
    void usedDays;
  }
}

export async function getManagerForUser(userId: number) {
  const mapRes = await query(
    `SELECT manager_user_id FROM employee_manager_map WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return mapRes.rowCount ? Number(mapRes.rows[0].manager_user_id) : null;
}

export async function setManagerMapping(actorUserId: number, userId: number, managerUserId: number) {
  await query(
    `INSERT INTO employee_manager_map (user_id, manager_user_id, updated_by_user_id, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET manager_user_id = EXCLUDED.manager_user_id, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = NOW()`,
    [userId, managerUserId, actorUserId],
  );
}

export async function getLeaveDashboard(userId: number) {
  await ensureAccrual(userId, toIsoDate(new Date()));
  const balancesRes = await query(
    `SELECT leave_type, opening_days, accrued_days, used_days,
            GREATEST(0, opening_days + accrued_days - used_days) AS remaining_days
     FROM employee_leave_balances
     WHERE user_id = $1
     ORDER BY leave_type ASC`,
    [userId],
  );
  const requestsRes = await query(
    `SELECT id, leave_type, from_date, to_date, total_days, paid_days, lop_days, reason, status, decision_note, created_at, updated_at
     FROM leave_requests
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId],
  );
  const holidays = await listHolidays();
  return {
    balances: balancesRes.rows,
    requests: requestsRes.rows,
    holidays,
  };
}

export async function listLeaveRequests(userId: number, role: string) {
  if (role === "admin" || role === "coordinator") {
    const res = await query(
      `SELECT r.*, u.full_name AS user_name, u.email AS user_email, mu.full_name AS manager_name
       FROM leave_requests r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN users mu ON mu.id = r.manager_user_id
       ORDER BY r.created_at DESC`,
      [],
    );
    return res.rows;
  }
  const managerRes = await query(
    `SELECT r.*, u.full_name AS user_name, u.email AS user_email, mu.full_name AS manager_name
     FROM leave_requests r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN users mu ON mu.id = r.manager_user_id
     WHERE r.user_id = $1 OR r.manager_user_id = $1
     ORDER BY r.created_at DESC`,
    [userId],
  );
  return managerRes.rows;
}

export async function createLeaveRequest(input: {
  userId: number;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  reason?: string | null;
}) {
  if (!["sick", "casual"].includes(input.leaveType)) {
    throw new Error("Leave type must be sick or casual.");
  }
  if (!input.fromDate || !input.toDate) throw new Error("From and To date are required.");
  if (input.toDate < input.fromDate) throw new Error("To date must be on or after from date.");

  await ensureAccrual(input.userId, input.fromDate);
  const managerUserId = await getManagerForUser(input.userId);
  const holidaySet = await getHolidaySet(input.fromDate, input.toDate);
  const totalDays = countChargeableDays(input.fromDate, input.toDate, holidaySet);

  const balanceRes = await query(
    `SELECT opening_days, accrued_days, used_days
     FROM employee_leave_balances WHERE user_id = $1 AND leave_type = $2 LIMIT 1`,
    [input.userId, input.leaveType],
  );
  const row = (balanceRes.rows[0] || {}) as any;
  const remaining = Math.max(0, Number(row.opening_days || 0) + Number(row.accrued_days || 0) - Number(row.used_days || 0));
  const paidDays = Math.min(totalDays, remaining);
  const lopDays = Math.max(0, totalDays - paidDays);

  const ins = await query(
    `INSERT INTO leave_requests
      (user_id, manager_user_id, leave_type, from_date, to_date, total_days, paid_days, lop_days, reason, status, created_at, updated_at)
     VALUES
      ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, 'pending', NOW(), NOW())
     RETURNING *`,
    [input.userId, managerUserId, input.leaveType, input.fromDate, input.toDate, totalDays, paidDays, lopDays, input.reason || null],
  );
  return ins.rows[0];
}

export async function decideLeaveRequest(input: {
  actorUserId: number;
  actorRole: string;
  requestId: number;
  decision: "approved" | "rejected";
  note?: string | null;
}) {
  const reqRes = await query(`SELECT * FROM leave_requests WHERE id = $1 LIMIT 1`, [input.requestId]);
  if (reqRes.rowCount === 0) throw new Error("Leave request not found.");
  const request = reqRes.rows[0] as any;
  if (request.status !== "pending") throw new Error("Leave request already decided.");

  const actorCanApprove =
    input.actorRole === "admin" ||
    input.actorRole === "coordinator" ||
    Number(request.manager_user_id || 0) === input.actorUserId;
  if (!actorCanApprove) throw new Error("You can only approve your mapped team requests.");

  await query(
    `UPDATE leave_requests
     SET status = $2, decision_note = $3, decided_by_user_id = $4, decided_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [input.requestId, input.decision, input.note || null, input.actorUserId],
  );

  if (input.decision === "approved" && Number(request.paid_days || 0) > 0) {
    await ensureBalanceRows(Number(request.user_id));
    await query(
      `UPDATE employee_leave_balances
       SET used_days = used_days + $3, updated_at = NOW()
       WHERE user_id = $1 AND leave_type = $2`,
      [Number(request.user_id), String(request.leave_type), Number(request.paid_days || 0)],
    );
  }

  const outRes = await query(`SELECT * FROM leave_requests WHERE id = $1`, [input.requestId]);
  return outRes.rows[0];
}

export async function getLeavePolicies() {
  const policy = await getPolicy();
  return policy;
}

export async function updateLeavePolicies(actorUserId: number, input: Partial<LeavePolicy>) {
  const current = await getPolicy();
  const next: LeavePolicy = {
    sick_accrual_monthly: input.sick_accrual_monthly == null ? current.sick_accrual_monthly : Number(input.sick_accrual_monthly),
    casual_accrual_monthly: input.casual_accrual_monthly == null ? current.casual_accrual_monthly : Number(input.casual_accrual_monthly),
    sick_carry_forward_cap: input.sick_carry_forward_cap == null ? current.sick_carry_forward_cap : Number(input.sick_carry_forward_cap),
    casual_carry_forward_cap: input.casual_carry_forward_cap == null ? current.casual_carry_forward_cap : Number(input.casual_carry_forward_cap),
  };
  await query(
    `UPDATE leave_policies
     SET sick_accrual_monthly = $2, casual_accrual_monthly = $3, sick_carry_forward_cap = $4, casual_carry_forward_cap = $5, updated_by_user_id = $6, updated_at = NOW()
     WHERE id = 1`,
    [1, next.sick_accrual_monthly, next.casual_accrual_monthly, next.sick_carry_forward_cap, next.casual_carry_forward_cap, actorUserId],
  );
  return next;
}

export async function addHoliday(actorUserId: number, holidayDate: string, holidayName: string, locationScope?: string | null) {
  if (!holidayDate || !holidayName?.trim()) throw new Error("Holiday date and name are required.");
  const res = await query(
    `INSERT INTO holiday_calendar (holiday_date, holiday_name, location_scope, created_by_user_id, created_at, updated_at)
     VALUES ($1::date, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (holiday_date)
     DO UPDATE SET holiday_name = EXCLUDED.holiday_name, location_scope = EXCLUDED.location_scope, updated_at = NOW()
     RETURNING *`,
    [holidayDate, holidayName.trim(), locationScope || null, actorUserId],
  );
  return res.rows[0];
}

export async function getMonthlyApprovedLopDays(userId: number, year: number, month: number) {
  const monthStartIso = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
  const monthEndIso = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const res = await query(
    `SELECT COALESCE(SUM(lop_days), 0) AS total_lop_days
     FROM leave_requests
     WHERE user_id = $1
       AND status = 'approved'
       AND from_date <= $3::date
       AND to_date >= $2::date`,
    [userId, monthStartIso, monthEndIso],
  );
  return Number(res.rows[0]?.total_lop_days || 0);
}
