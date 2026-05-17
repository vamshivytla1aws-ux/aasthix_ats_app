import { query } from "@/lib/db";
import { writeAuditLog } from "@/lib/auditLog";

export type ShiftRuleInput = {
  userId: number;
  shiftName: string;
  startTime: string;
  endTime: string;
  lateGraceMinutes: number;
  earlyLogoutGraceMinutes: number;
  halfDayMinutes: number;
  overtimeAfterMinutes: number;
  wfhAllowed: boolean;
};

export async function listShiftRules(actorUserId: number, role: string, userId?: number) {
  const values: Array<number> = [];
  let where = "";
  if (role === "employee") {
    where = "WHERE r.user_id = $1";
    values.push(actorUserId);
  } else if (role === "hiring_manager" || role === "manager") {
    where = "WHERE u.reporting_manager_user_id = $1";
    values.push(actorUserId);
  } else if (userId && Number(userId) > 0) {
    where = "WHERE r.user_id = $1";
    values.push(Number(userId));
  }

  const res = await query(
    `
      SELECT
        r.*,
        COALESCE(u.full_name, '') AS user_name
      FROM attendance_shift_rules r
      JOIN users u ON u.id = r.user_id
      ${where}
      ORDER BY LOWER(u.full_name) ASC
    `,
    values,
  );
  return res.rows;
}

export async function upsertShiftRule(input: ShiftRuleInput, actorUserId: number) {
  await query(
    `
      INSERT INTO attendance_shift_rules
      (user_id, shift_name, start_time, end_time, late_grace_minutes, early_logout_grace_minutes, half_day_minutes, overtime_after_minutes, wfh_allowed, updated_by_user_id, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        shift_name = EXCLUDED.shift_name,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        late_grace_minutes = EXCLUDED.late_grace_minutes,
        early_logout_grace_minutes = EXCLUDED.early_logout_grace_minutes,
        half_day_minutes = EXCLUDED.half_day_minutes,
        overtime_after_minutes = EXCLUDED.overtime_after_minutes,
        wfh_allowed = EXCLUDED.wfh_allowed,
        updated_by_user_id = EXCLUDED.updated_by_user_id,
        updated_at = NOW()
    `,
    [
      input.userId,
      input.shiftName,
      input.startTime,
      input.endTime,
      Math.max(0, Math.floor(input.lateGraceMinutes)),
      Math.max(0, Math.floor(input.earlyLogoutGraceMinutes)),
      Math.max(0, Math.floor(input.halfDayMinutes)),
      Math.max(0, Math.floor(input.overtimeAfterMinutes)),
      Boolean(input.wfhAllowed),
      actorUserId,
    ],
  );
  await writeAuditLog({
    actorUserId,
    action: "hrms.attendance_rule.updated",
    metadata: { user_id: input.userId, shift_name: input.shiftName },
  });
}

export async function createCorrectionRequest(input: {
  userId: number;
  attendanceDate: string;
  requestedCheckIn?: string | null;
  requestedCheckOut?: string | null;
  reason: string;
  managerUserId?: number | null;
}) {
  const ins = await query(
    `
      INSERT INTO attendance_corrections
      (user_id, attendance_date, requested_check_in, requested_check_out, reason, manager_user_id, status, created_at, updated_at)
      VALUES ($1,$2::date,$3::timestamptz,$4::timestamptz,$5,$6,'pending',NOW(),NOW())
      RETURNING id
    `,
    [
      input.userId,
      input.attendanceDate,
      input.requestedCheckIn || null,
      input.requestedCheckOut || null,
      input.reason,
      input.managerUserId || null,
    ],
  );
  return Number(ins.rows[0]?.id || 0);
}

export async function listCorrectionRequests(actorUserId: number, role: string) {
  const values: Array<number> = [];
  let where = "";
  if (role === "employee") {
    where = "WHERE c.user_id = $1";
    values.push(actorUserId);
  } else if (role === "hiring_manager" || role === "manager") {
    where = "WHERE c.manager_user_id = $1";
    values.push(actorUserId);
  }
  const res = await query(
    `
      SELECT
        c.*,
        COALESCE(u.full_name, '') AS user_name
      FROM attendance_corrections c
      JOIN users u ON u.id = c.user_id
      ${where}
      ORDER BY c.created_at DESC
    `,
    values,
  );
  return res.rows;
}

export async function decideCorrectionRequest(input: {
  id: number;
  decision: "approved" | "rejected";
  decisionNote?: string | null;
  decidedByUserId: number;
}) {
  await query(
    `
      UPDATE attendance_corrections
      SET
        status = $2,
        decision_note = $3,
        decided_by_user_id = $4,
        decided_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `,
    [input.id, input.decision, input.decisionNote || null, input.decidedByUserId],
  );
  await writeAuditLog({
    actorUserId: input.decidedByUserId,
    action: "hrms.attendance_correction.decided",
    metadata: { correction_id: input.id, decision: input.decision },
  });
}
