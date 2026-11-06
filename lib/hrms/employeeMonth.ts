import { query } from "@/lib/db";
import type { AuthAccess } from "@/lib/rbac";

export function monthWindow(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Select a valid month.");
  const [year, m] = month.split("-").map(Number);
  if (year < 2000 || year > 2100) throw new Error("Select a month between 2000 and 2100.");
  const next = new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10);
  return { start: `${month}-01`, end: next, days: new Date(Date.UTC(year, m, 0)).getUTCDate() };
}

export function monthAttendance(month: string, rows: Array<Record<string, unknown>>) {
  const { days } = monthWindow(month);
  const byDay = new Map(rows.map(row => [String(row.attendance_date).slice(0, 10), row]));
  const entries = Array.from({ length: days }, (_, index) => {
    const date = `${month}-${String(index + 1).padStart(2, "0")}`;
    const record = byDay.get(date);
    return { date, status: record ? String(record.status) : "not_recorded", firstCheckIn: record?.first_check_in_at || null,
      lastCheckOut: record?.last_check_out_at || null, minutes: Number(record?.total_minutes || 0) };
  });
  const count = (status: string) => entries.filter(row => row.status === status).length;
  return { entries, totals: { present: count("present"), late: count("late"), absent: count("absent"), notRecorded: count("not_recorded"), minutes: entries.reduce((sum, row) => sum + row.minutes, 0) } };
}

export function monthRecordAccess(access: AuthAccess, employee: { id: number; reporting_manager_user_id?: number | null }) {
  const own = access.user_id === Number(employee.id);
  // Employee sessions remain restricted to their own records, even with a broader scope setting.
  if (access.role === "employee" && !own) return { attendance: false, leave: false };
  return {
    attendance: (own && access.permissions["attendance.view_self"] === true) || (access.role !== "employee" && access.permissions["attendance.view_all"] === true),
    leave: (own && access.permissions["leave.view_self"] === true) || (access.role !== "employee" && (
      access.permissions["leave.manage_policy"] === true || (access.permissions["leave.approve_team"] === true && Number(employee.reporting_manager_user_id) === access.user_id))),
  };
}

export async function readEmployeeMonth(access: AuthAccess, employeeId: number, month: string) {
  const window = monthWindow(month);
  const result = await query(`SELECT u.id, u.full_name, m.manager_user_id AS reporting_manager_user_id
    FROM users u LEFT JOIN employee_manager_map m ON m.user_id = u.id WHERE u.id = $1`, [employeeId]);
  const employee = result.rows[0];
  if (!employee) return { status: 404 as const, error: "Employee not found." };
  const allowed = monthRecordAccess(access, employee);
  if (!allowed.attendance && !allowed.leave) return { status: 403 as const, error: "Forbidden" };
  const teamLeaveOnly = employeeId !== access.user_id && !access.permissions["leave.manage_policy"];
  const [attendance, leave] = await Promise.all([
    allowed.attendance ? query(`SELECT attendance_date::text, status, first_check_in_at, last_check_out_at, total_minutes
      FROM attendance_records WHERE user_id = $1 AND attendance_date >= $2::date AND attendance_date < $3::date ORDER BY attendance_date`, [employeeId, window.start, window.end]) : null,
    allowed.leave ? query(`SELECT r.id, r.user_id, u.full_name AS user_name, r.leave_type, r.from_date::text, r.to_date::text,
      r.total_days, r.paid_days, r.lop_days, r.reason, r.status, r.decision_note
      FROM leave_requests r JOIN users u ON u.id = r.user_id
      WHERE r.user_id = $1 AND r.from_date < $3::date AND r.to_date >= $2::date
      ${teamLeaveOnly ? "AND r.manager_user_id = $4" : ""} ORDER BY r.from_date DESC, r.id DESC`,
      teamLeaveOnly ? [employeeId, window.start, window.end, access.user_id] : [employeeId, window.start, window.end]) : null,
  ]);
  return { status: 200 as const, data: { employeeId, employeeName: employee.full_name, month,
    attendance: allowed.attendance ? { available: true, ...monthAttendance(month, attendance!.rows) } : { available: false },
    leave: allowed.leave ? { available: true, requests: leave!.rows } : { available: false },
    links: { attendance: allowed.attendance && access.permissions["attendance.manage_all"] ? `/attendance?user_id=${employeeId}&date=${window.start}` : null,
      leave: allowed.leave && access.role !== "employee" && access.permissions["leave.approve_team"] ? `/leave?user_id=${employeeId}&month=${month}` : null },
  } };
}
