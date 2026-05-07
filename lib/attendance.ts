import { query } from "@/lib/db";

export type AttendanceStatus = "present" | "late" | "absent";
export type AttendanceSource = "self" | "admin" | "system";

export type AttendanceSettings = {
  company_timezone: string;
  start_time_local: string;
  grace_minutes: number;
  working_days: number[];
  updated_by_user_id: number | null;
  updated_at: string | null;
};

export type AttendanceRecord = {
  id: number;
  user_id: number;
  attendance_date: string;
  status: AttendanceStatus;
  first_check_in_at: string | null;
  last_check_out_at: string | null;
  total_minutes: number;
  source: AttendanceSource;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

export type AttendanceRegisterRow = {
  user_id: number;
  full_name: string;
  email: string;
  role: string;
  attendance_enabled: boolean;
  attendance_date: string;
  status: AttendanceStatus | "not_checked_in";
  first_check_in_at: string | null;
  last_check_out_at: string | null;
  total_minutes: number;
  source: AttendanceSource | null;
  admin_note: string | null;
  shift_start_time_local: string | null;
  shift_grace_minutes: number | null;
  effective_start_time_local: string;
  effective_grace_minutes: number;
};

const DEFAULT_SETTINGS: AttendanceSettings = {
  company_timezone: "Asia/Kolkata",
  start_time_local: "09:30",
  grace_minutes: 15,
  working_days: [1, 2, 3, 4, 5],
  updated_by_user_id: null,
  updated_at: null,
};

function toNumber(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanTime(value: unknown, fallback = "09:30") {
  const s = String(value || "").trim();
  return /^[0-2][0-9]:[0-5][0-9]$/.test(s) ? s : fallback;
}

function parseWorkingDays(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : [];
  const next = raw
    .map((item) => toNumber(item, -1))
    .filter((item) => item >= 0 && item <= 6);
  return next.length ? Array.from(new Set(next)) : DEFAULT_SETTINGS.working_days;
}

function getParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
    weekday: map.weekday,
  };
}

export function formatAttendanceDate(date: Date, timeZone: string) {
  const parts = getParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localMinutes(date: Date, timeZone: string) {
  const parts = getParts(date, timeZone);
  return toNumber(parts.hour) * 60 + toNumber(parts.minute);
}

function shiftDate(date: Date, timeZone: string, diffDays: number) {
  const current = formatAttendanceDate(date, timeZone);
  const noon = new Date(`${current}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + diffDays);
  return noon;
}

function weekdayIndex(attendanceDate: string) {
  return new Date(`${attendanceDate}T12:00:00Z`).getUTCDay();
}

function isWorkingDay(attendanceDate: string, settings: AttendanceSettings) {
  return settings.working_days.includes(weekdayIndex(attendanceDate));
}

function deriveStatus(date: Date, settings: AttendanceSettings): AttendanceStatus {
  const [startHour, startMinute] = settings.start_time_local.split(":").map((part) => toNumber(part));
  const startMinutes = startHour * 60 + startMinute + settings.grace_minutes;
  return localMinutes(date, settings.company_timezone) > startMinutes ? "late" : "present";
}

function deriveStatusWithShift(
  date: Date,
  settings: AttendanceSettings,
  shift?: { start_time_local: string | null; grace_minutes: number | null } | null
): AttendanceStatus {
  const start = cleanTime(shift?.start_time_local, settings.start_time_local);
  const grace = Math.max(0, Math.min(240, toNumber(shift?.grace_minutes, settings.grace_minutes)));
  const [startHour, startMinute] = start.split(":").map((part) => toNumber(part));
  const startMinutes = startHour * 60 + startMinute + grace;
  return localMinutes(date, settings.company_timezone) > startMinutes ? "late" : "present";
}

function totalMinutesBetween(start: string | null, end: string | null) {
  if (!start || !end) return 0;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.max(0, Math.round(diff / 60000));
}

function normalizeSettingsRow(row: Record<string, unknown> | undefined | null): AttendanceSettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    company_timezone: String(row.company_timezone || DEFAULT_SETTINGS.company_timezone),
    start_time_local: cleanTime(row.start_time_local, DEFAULT_SETTINGS.start_time_local),
    grace_minutes: toNumber(row.grace_minutes, DEFAULT_SETTINGS.grace_minutes),
    working_days: parseWorkingDays(row.working_days),
    updated_by_user_id: row.updated_by_user_id == null ? null : toNumber(row.updated_by_user_id),
    updated_at: row.updated_at ? String(row.updated_at) : null,
  };
}

function normalizeRecord(row: Record<string, unknown> | undefined | null): AttendanceRecord | null {
  if (!row) return null;
  return {
    id: toNumber(row.id),
    user_id: toNumber(row.user_id),
    attendance_date: String(row.attendance_date),
    status: String(row.status) as AttendanceStatus,
    first_check_in_at: row.first_check_in_at ? String(row.first_check_in_at) : null,
    last_check_out_at: row.last_check_out_at ? String(row.last_check_out_at) : null,
    total_minutes: toNumber(row.total_minutes),
    source: String(row.source || "self") as AttendanceSource,
    admin_note: row.admin_note ? String(row.admin_note) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  const res = await query(
    `
    SELECT company_timezone, start_time_local, grace_minutes, working_days, updated_by_user_id, updated_at
    FROM attendance_settings
    WHERE id = 1
    LIMIT 1
    `
  ).catch(() => ({ rows: [] }));
  return normalizeSettingsRow((res.rows?.[0] as Record<string, unknown> | undefined) ?? null);
}

export async function updateAttendanceSettings(input: {
  company_timezone: string;
  start_time_local: string;
  grace_minutes: number;
  working_days: number[];
  updated_by_user_id: number;
}) {
  const workingDays = parseWorkingDays(input.working_days);
  const res = await query(
    `
    INSERT INTO attendance_settings (
      id,
      company_timezone,
      start_time_local,
      grace_minutes,
      working_days,
      updated_by_user_id,
      updated_at
    )
    VALUES (1, $1, $2, $3, $4::jsonb, $5, NOW())
    ON CONFLICT (id) DO UPDATE SET
      company_timezone = EXCLUDED.company_timezone,
      start_time_local = EXCLUDED.start_time_local,
      grace_minutes = EXCLUDED.grace_minutes,
      working_days = EXCLUDED.working_days,
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      updated_at = NOW()
    RETURNING company_timezone, start_time_local, grace_minutes, working_days, updated_by_user_id, updated_at
    `,
    [
      String(input.company_timezone || DEFAULT_SETTINGS.company_timezone),
      cleanTime(input.start_time_local, DEFAULT_SETTINGS.start_time_local),
      Math.max(0, Math.min(240, toNumber(input.grace_minutes, DEFAULT_SETTINGS.grace_minutes))),
      JSON.stringify(workingDays),
      input.updated_by_user_id,
    ]
  );
  return normalizeSettingsRow(res.rows?.[0] as Record<string, unknown>);
}

export function getAttendanceTargetDates(settings: AttendanceSettings, now = new Date()) {
  const today = formatAttendanceDate(now, settings.company_timezone);
  const yesterday = formatAttendanceDate(shiftDate(now, settings.company_timezone, -1), settings.company_timezone);
  return { today, yesterday };
}

export async function getAttendanceRecordForUserDate(userId: number, attendanceDate: string) {
  const res = await query(
    `
    SELECT id, user_id, attendance_date::text, status, first_check_in_at, last_check_out_at, total_minutes, source, admin_note, created_at, updated_at
    FROM attendance_records
    WHERE user_id = $1 AND attendance_date = $2::date
    LIMIT 1
    `,
    [userId, attendanceDate]
  ).catch(() => ({ rows: [] }));
  return normalizeRecord((res.rows?.[0] as Record<string, unknown> | undefined) ?? null);
}

export async function getTodayAttendanceForUser(userId: number) {
  const settings = await getAttendanceSettings();
  const today = formatAttendanceDate(new Date(), settings.company_timezone);
  const record = await getAttendanceRecordForUserDate(userId, today);
  return { settings, today, record };
}

export async function checkInUser(userId: number, source: AttendanceSource = "self") {
  const settings = await getAttendanceSettings();
  const now = new Date();
  const attendanceDate = formatAttendanceDate(now, settings.company_timezone);
  const userShiftRes = await query(
    `SELECT shift_start_time_local, shift_grace_minutes FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  ).catch(() => ({ rows: [] }));
  const userShiftRow = (userShiftRes.rows?.[0] as Record<string, unknown> | undefined) ?? null;
  const status = deriveStatusWithShift(now, settings, {
    start_time_local: userShiftRow?.shift_start_time_local ? String(userShiftRow.shift_start_time_local) : null,
    grace_minutes: userShiftRow?.shift_grace_minutes == null ? null : toNumber(userShiftRow.shift_grace_minutes),
  });

  const res = await query(
    `
    INSERT INTO attendance_records (
      user_id,
      attendance_date,
      status,
      first_check_in_at,
      last_check_out_at,
      total_minutes,
      source,
      admin_note,
      created_at,
      updated_at
    )
    VALUES ($1, $2::date, $3, $4, NULL, 0, $5, NULL, NOW(), NOW())
    ON CONFLICT (user_id, attendance_date) DO UPDATE SET
      status = CASE
        WHEN attendance_records.first_check_in_at IS NULL THEN EXCLUDED.status
        ELSE attendance_records.status
      END,
      first_check_in_at = COALESCE(attendance_records.first_check_in_at, EXCLUDED.first_check_in_at),
      source = CASE
        WHEN attendance_records.first_check_in_at IS NULL THEN EXCLUDED.source
        ELSE attendance_records.source
      END,
      updated_at = NOW()
    RETURNING id, user_id, attendance_date::text, status, first_check_in_at, last_check_out_at, total_minutes, source, admin_note, created_at, updated_at
    `,
    [userId, attendanceDate, status, now.toISOString(), source]
  );

  return {
    settings,
    record: normalizeRecord(res.rows?.[0] as Record<string, unknown>),
  };
}

export async function checkOutUser(userId: number, source: AttendanceSource = "self") {
  const settings = await getAttendanceSettings();
  const now = new Date();
  const attendanceDate = formatAttendanceDate(now, settings.company_timezone);
  const existing = await getAttendanceRecordForUserDate(userId, attendanceDate);
  if (!existing || !existing.first_check_in_at) {
    throw new Error("You need to check in before checking out.");
  }

  const totalMinutes = totalMinutesBetween(existing.first_check_in_at, now.toISOString());
  const res = await query(
    `
    UPDATE attendance_records
    SET
      last_check_out_at = $3,
      total_minutes = $4,
      source = $5,
      updated_at = NOW()
    WHERE user_id = $1
      AND attendance_date = $2::date
    RETURNING id, user_id, attendance_date::text, status, first_check_in_at, last_check_out_at, total_minutes, source, admin_note, created_at, updated_at
    `,
    [userId, attendanceDate, now.toISOString(), totalMinutes, source]
  );

  return {
    settings,
    record: normalizeRecord(res.rows?.[0] as Record<string, unknown>),
  };
}

export async function getAttendanceRecentForUser(userId: number, limit = 14) {
  const res = await query(
    `
    SELECT id, user_id, attendance_date::text, status, first_check_in_at, last_check_out_at, total_minutes, source, admin_note, created_at, updated_at
    FROM attendance_records
    WHERE user_id = $1
    ORDER BY attendance_date DESC
    LIMIT $2
    `,
    [userId, limit]
  ).catch(() => ({ rows: [] }));
  return res.rows
    .map((row: unknown) => normalizeRecord(row as Record<string, unknown>))
    .filter(Boolean) as AttendanceRecord[];
}

export async function markAbsentForDate(attendanceDate: string, actorUserId: number | null = null) {
  const settings = await getAttendanceSettings();
  if (!isWorkingDay(attendanceDate, settings)) {
    return { attendanceDate, inserted: 0, skipped: true, settings };
  }

  const res = await query(
    `
    INSERT INTO attendance_records (
      user_id,
      attendance_date,
      status,
      first_check_in_at,
      last_check_out_at,
      total_minutes,
      source,
      admin_note,
      created_at,
      updated_at
    )
    SELECT
      u.id,
      $1::date,
      'absent',
      NULL,
      NULL,
      0,
      'system',
      CASE WHEN $2::bigint IS NULL THEN 'Auto-marked absent' ELSE 'Marked absent by admin review' END,
      NOW(),
      NOW()
    FROM users u
    WHERE COALESCE(u.attendance_enabled, TRUE) = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM attendance_records ar
        WHERE ar.user_id = u.id
          AND ar.attendance_date = $1::date
      )
    `,
    [attendanceDate, actorUserId]
  );

  return { attendanceDate, inserted: res.rowCount ?? 0, skipped: false, settings };
}

export async function getAttendanceSummary(attendanceDate: string) {
  const settings = await getAttendanceSettings();
  const workingDay = isWorkingDay(attendanceDate, settings);
  const res = await query(
    `
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(u.attendance_enabled, TRUE) = TRUE) ::int AS eligible_users,
      COUNT(*) FILTER (WHERE COALESCE(u.attendance_enabled, TRUE) = TRUE AND ar.status = 'present') ::int AS present_count,
      COUNT(*) FILTER (WHERE COALESCE(u.attendance_enabled, TRUE) = TRUE AND ar.status = 'late') ::int AS late_count,
      COUNT(*) FILTER (WHERE COALESCE(u.attendance_enabled, TRUE) = TRUE AND ar.status = 'absent') ::int AS absent_count,
      COUNT(*) FILTER (WHERE COALESCE(u.attendance_enabled, TRUE) = TRUE AND ar.id IS NULL) ::int AS not_checked_in_count
    FROM users u
    LEFT JOIN attendance_records ar
      ON ar.user_id = u.id
     AND ar.attendance_date = $1::date
    `,
    [attendanceDate]
  );
  const row = (res.rows?.[0] as Record<string, unknown>) || {};
  return {
    attendance_date: attendanceDate,
    working_day: workingDay,
    eligible_users: toNumber(row.eligible_users),
    present_count: toNumber(row.present_count),
    late_count: toNumber(row.late_count),
    absent_count: toNumber(row.absent_count),
    not_checked_in_count: workingDay ? toNumber(row.not_checked_in_count) : 0,
    settings,
  };
}

export async function getAttendanceRegister(input: {
  attendanceDate: string;
  status?: AttendanceStatus | "not_checked_in" | "all";
  role?: string | "all";
  userId?: number | null;
  q?: string | null;
}) {
  const settings = await getAttendanceSettings();
  const params: unknown[] = [input.attendanceDate];
  const where: string[] = ["COALESCE(u.attendance_enabled, TRUE) = TRUE"];

  if (input.role && input.role !== "all") {
    params.push(input.role);
    where.push(`LOWER(COALESCE(u.role, 'user')) = LOWER($${params.length})`);
  }
  if (input.userId) {
    params.push(input.userId);
    where.push(`u.id = $${params.length}`);
  }
  if (input.q) {
    params.push(`%${String(input.q).trim()}%`);
    where.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  if (input.status && input.status !== "all") {
    if (input.status === "not_checked_in") {
      where.push("ar.id IS NULL");
    } else {
      params.push(input.status);
      where.push(`ar.status = $${params.length}`);
    }
  }

  const res = await query(
    `
    SELECT
      u.id AS user_id,
      u.full_name,
      u.email,
      LOWER(COALESCE(u.role, 'user')) AS role,
      COALESCE(u.attendance_enabled, TRUE) AS attendance_enabled,
      u.shift_start_time_local,
      u.shift_grace_minutes,
      $1::date::text AS attendance_date,
      CASE
        WHEN ar.id IS NULL THEN 'not_checked_in'
        ELSE ar.status
      END AS status,
      ar.first_check_in_at,
      ar.last_check_out_at,
      COALESCE(ar.total_minutes, 0) AS total_minutes,
      ar.source,
      ar.admin_note
    FROM users u
    LEFT JOIN attendance_records ar
      ON ar.user_id = u.id
     AND ar.attendance_date = $1::date
    WHERE ${where.join(" AND ")}
    ORDER BY
      CASE
        WHEN ar.id IS NULL THEN 1
        WHEN ar.status = 'late' THEN 2
        WHEN ar.status = 'absent' THEN 3
        ELSE 4
      END,
      LOWER(u.full_name) ASC
    `,
    params
  );

  return (res.rows as Record<string, unknown>[]).map((row) => ({
    user_id: toNumber(row.user_id),
    full_name: String(row.full_name || ""),
    email: String(row.email || ""),
    role: String(row.role || "user"),
    attendance_enabled: Boolean(row.attendance_enabled),
    attendance_date: String(row.attendance_date),
    status: String(row.status || "not_checked_in") as AttendanceRegisterRow["status"],
    first_check_in_at: row.first_check_in_at ? String(row.first_check_in_at) : null,
    last_check_out_at: row.last_check_out_at ? String(row.last_check_out_at) : null,
    total_minutes: toNumber(row.total_minutes),
    source: row.source ? (String(row.source) as AttendanceSource) : null,
    admin_note: row.admin_note ? String(row.admin_note) : null,
    shift_start_time_local: row.shift_start_time_local ? String(row.shift_start_time_local) : null,
    shift_grace_minutes: row.shift_grace_minutes == null ? null : toNumber(row.shift_grace_minutes),
    effective_start_time_local: cleanTime(row.shift_start_time_local, settings.start_time_local),
    effective_grace_minutes:
      row.shift_grace_minutes == null
        ? settings.grace_minutes
        : Math.max(0, Math.min(240, toNumber(row.shift_grace_minutes, settings.grace_minutes))),
  })) as AttendanceRegisterRow[];
}

export async function adminUpsertAttendance(input: {
  userId: number;
  attendanceDate: string;
  status: AttendanceStatus;
  firstCheckInAt?: string | null;
  lastCheckOutAt?: string | null;
  adminNote?: string | null;
}) {
  const settings = await getAttendanceSettings();
  const userShiftRes = await query(
    `SELECT shift_start_time_local, shift_grace_minutes FROM users WHERE id = $1 LIMIT 1`,
    [input.userId]
  ).catch(() => ({ rows: [] }));
  const userShiftRow = (userShiftRes.rows?.[0] as Record<string, unknown> | undefined) ?? null;
  const firstCheckInAt = input.status === "absent" ? null : input.firstCheckInAt || null;
  const lastCheckOutAt = input.status === "absent" ? null : input.lastCheckOutAt || null;
  const derivedStatus =
    input.status === "absent"
      ? "absent"
      : firstCheckInAt
        ? deriveStatusWithShift(new Date(firstCheckInAt), settings, {
            start_time_local: userShiftRow?.shift_start_time_local ? String(userShiftRow.shift_start_time_local) : null,
            grace_minutes: userShiftRow?.shift_grace_minutes == null ? null : toNumber(userShiftRow.shift_grace_minutes),
          })
        : input.status;
  const totalMinutes = totalMinutesBetween(firstCheckInAt, lastCheckOutAt);

  const res = await query(
    `
    INSERT INTO attendance_records (
      user_id,
      attendance_date,
      status,
      first_check_in_at,
      last_check_out_at,
      total_minutes,
      source,
      admin_note,
      created_at,
      updated_at
    )
    VALUES ($1, $2::date, $3, $4, $5, $6, 'admin', $7, NOW(), NOW())
    ON CONFLICT (user_id, attendance_date) DO UPDATE SET
      status = EXCLUDED.status,
      first_check_in_at = EXCLUDED.first_check_in_at,
      last_check_out_at = EXCLUDED.last_check_out_at,
      total_minutes = EXCLUDED.total_minutes,
      source = 'admin',
      admin_note = EXCLUDED.admin_note,
      updated_at = NOW()
    RETURNING id, user_id, attendance_date::text, status, first_check_in_at, last_check_out_at, total_minutes, source, admin_note, created_at, updated_at
    `,
    [input.userId, input.attendanceDate, derivedStatus, firstCheckInAt, lastCheckOutAt, totalMinutes, input.adminNote || null]
  );
  return normalizeRecord(res.rows?.[0] as Record<string, unknown>);
}

export async function updateUserAttendanceShift(input: {
  userId: number;
  startTimeLocal: string | null;
  graceMinutes: number | null;
}) {
  const startTime =
    input.startTimeLocal && input.startTimeLocal.trim().length
      ? cleanTime(input.startTimeLocal, DEFAULT_SETTINGS.start_time_local)
      : null;
  const grace =
    input.graceMinutes == null ? null : Math.max(0, Math.min(240, toNumber(input.graceMinutes, DEFAULT_SETTINGS.grace_minutes)));

  const res = await query(
    `
    UPDATE users
    SET
      shift_start_time_local = $2,
      shift_grace_minutes = $3
    WHERE id = $1
    RETURNING id, shift_start_time_local, shift_grace_minutes
    `,
    [input.userId, startTime, grace]
  );

  const row = (res.rows?.[0] as Record<string, unknown> | undefined) ?? null;
  if (!row) return null;
  return {
    user_id: toNumber(row.id),
    shift_start_time_local: row.shift_start_time_local ? String(row.shift_start_time_local) : null,
    shift_grace_minutes: row.shift_grace_minutes == null ? null : toNumber(row.shift_grace_minutes),
  };
}
