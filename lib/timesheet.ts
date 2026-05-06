import { query } from "@/lib/db";

export type TimesheetStatus = "draft" | "submitted";
export type TimesheetSource = "self" | "admin";

export type TimesheetHeader = {
  id: number;
  user_id: number;
  entry_date: string;
  total_minutes: number;
  status: TimesheetStatus;
  notes: string | null;
  source: TimesheetSource;
  created_at: string;
  updated_at: string;
};

export type TimesheetEntry = {
  id: number;
  header_id: number;
  ticket_number: string;
  task_title: string;
  task_description: string | null;
  minutes_spent: number;
  work_type: string | null;
  project_or_client: string | null;
  source: TimesheetSource;
  created_at: string;
  updated_at: string;
};

export type TimesheetRegisterRow = {
  header_id: number;
  user_id: number;
  full_name: string;
  email: string;
  role: string;
  attendance_enabled: boolean;
  entry_date: string;
  total_minutes: number;
  status: TimesheetStatus;
  notes: string | null;
  entry_count: number;
  updated_at: string;
};

function toNumber(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeHeader(row: Record<string, unknown> | undefined | null): TimesheetHeader | null {
  if (!row) return null;
  return {
    id: toNumber(row.id),
    user_id: toNumber(row.user_id),
    entry_date: String(row.entry_date),
    total_minutes: toNumber(row.total_minutes),
    status: String(row.status) === "submitted" ? "submitted" : "draft",
    notes: row.notes ? String(row.notes) : null,
    source: String(row.source) === "admin" ? "admin" : "self",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeEntry(row: Record<string, unknown> | undefined | null): TimesheetEntry | null {
  if (!row) return null;
  return {
    id: toNumber(row.id),
    header_id: toNumber(row.header_id),
    ticket_number: String(row.ticket_number || ""),
    task_title: String(row.task_title || ""),
    task_description: row.task_description ? String(row.task_description) : null,
    minutes_spent: toNumber(row.minutes_spent),
    work_type: row.work_type ? String(row.work_type) : null,
    project_or_client: row.project_or_client ? String(row.project_or_client) : null,
    source: String(row.source) === "admin" ? "admin" : "self",
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getOrCreateTimesheetHeader(params: {
  userId: number;
  entryDate: string;
  source?: TimesheetSource;
}) {
  const source = params.source || "self";
  const res = await query(
    `
    INSERT INTO timesheet_headers (user_id, entry_date, total_minutes, status, notes, source, created_at, updated_at)
    VALUES ($1, $2::date, 0, 'draft', NULL, $3, NOW(), NOW())
    ON CONFLICT (user_id, entry_date)
    DO UPDATE SET updated_at = NOW()
    RETURNING id, user_id, entry_date::text, total_minutes, status, notes, source, created_at, updated_at
    `,
    [params.userId, params.entryDate, source]
  );
  return normalizeHeader(res.rows?.[0] as Record<string, unknown>);
}

export async function getTimesheetHeader(userId: number, entryDate: string) {
  const res = await query(
    `
    SELECT id, user_id, entry_date::text, total_minutes, status, notes, source, created_at, updated_at
    FROM timesheet_headers
    WHERE user_id = $1 AND entry_date = $2::date
    LIMIT 1
    `,
    [userId, entryDate]
  ).catch(() => ({ rows: [] }));
  return normalizeHeader((res.rows?.[0] as Record<string, unknown>) || null);
}

export async function getTimesheetHeaderById(headerId: number) {
  const res = await query(
    `
    SELECT id, user_id, entry_date::text, total_minutes, status, notes, source, created_at, updated_at
    FROM timesheet_headers
    WHERE id = $1
    LIMIT 1
    `,
    [headerId]
  ).catch(() => ({ rows: [] }));
  return normalizeHeader((res.rows?.[0] as Record<string, unknown>) || null);
}

export async function getTimesheetEntries(headerId: number) {
  const res = await query(
    `
    SELECT id, header_id, ticket_number, task_title, task_description, minutes_spent, work_type, project_or_client, source, created_at, updated_at
    FROM timesheet_entries
    WHERE header_id = $1
    ORDER BY id ASC
    `,
    [headerId]
  ).catch(() => ({ rows: [] }));
  return res.rows
    .map((row: unknown) => normalizeEntry(row as Record<string, unknown>))
    .filter(Boolean) as TimesheetEntry[];
}

export async function recomputeTimesheetTotal(headerId: number) {
  const sumRes = await query(
    `SELECT COALESCE(SUM(minutes_spent), 0) AS total FROM timesheet_entries WHERE header_id = $1`,
    [headerId]
  );
  const total = toNumber((sumRes.rows?.[0] as { total?: number })?.total, 0);
  await query(
    `UPDATE timesheet_headers SET total_minutes = $2, updated_at = NOW() WHERE id = $1`,
    [headerId, total]
  );
  return total;
}

export async function updateTimesheetHeader(params: {
  userId: number;
  entryDate: string;
  notes?: string | null;
  status?: TimesheetStatus;
  source?: TimesheetSource;
}) {
  const header = await getOrCreateTimesheetHeader({
    userId: params.userId,
    entryDate: params.entryDate,
    source: params.source || "self",
  });
  if (!header) return null;
  const nextStatus = params.status || header.status;
  const notes = params.notes === undefined ? header.notes : params.notes;
  const source = params.source || header.source;
  const res = await query(
    `
    UPDATE timesheet_headers
    SET status = $2,
        notes = $3,
        source = $4,
        updated_at = NOW()
    WHERE id = $1
    RETURNING id, user_id, entry_date::text, total_minutes, status, notes, source, created_at, updated_at
    `,
    [header.id, nextStatus, notes || null, source]
  );
  return normalizeHeader(res.rows?.[0] as Record<string, unknown>);
}

export async function upsertTimesheetEntry(params: {
  headerId: number;
  entryId?: number | null;
  ticketNumber: string;
  taskTitle: string;
  taskDescription?: string | null;
  minutesSpent: number;
  workType?: string | null;
  projectOrClient?: string | null;
  source?: TimesheetSource;
}) {
  const ticketNumber = cleanText(params.ticketNumber);
  const taskTitle = cleanText(params.taskTitle);
  const minutesSpent = Math.max(1, Math.min(1440, Math.round(toNumber(params.minutesSpent, 0))));
  if (!ticketNumber) throw new Error("Ticket number is required.");
  if (!taskTitle) throw new Error("Task title is required.");

  const source = params.source || "self";
  const isUpdate = params.entryId != null && Number.isFinite(Number(params.entryId));
  const res = isUpdate
    ? await query(
        `
        UPDATE timesheet_entries
        SET ticket_number = $2,
            task_title = $3,
            task_description = $4,
            minutes_spent = $5,
            work_type = $6,
            project_or_client = $7,
            source = $8,
            updated_at = NOW()
        WHERE id = $1 AND header_id = $9
        RETURNING id, header_id, ticket_number, task_title, task_description, minutes_spent, work_type, project_or_client, source, created_at, updated_at
        `,
        [
          Number(params.entryId),
          ticketNumber,
          taskTitle,
          params.taskDescription?.trim() || null,
          minutesSpent,
          params.workType?.trim() || null,
          params.projectOrClient?.trim() || null,
          source,
          params.headerId,
        ]
      )
    : await query(
        `
        INSERT INTO timesheet_entries (
          header_id,
          ticket_number,
          task_title,
          task_description,
          minutes_spent,
          work_type,
          project_or_client,
          source,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING id, header_id, ticket_number, task_title, task_description, minutes_spent, work_type, project_or_client, source, created_at, updated_at
        `,
        [
          params.headerId,
          ticketNumber,
          taskTitle,
          params.taskDescription?.trim() || null,
          minutesSpent,
          params.workType?.trim() || null,
          params.projectOrClient?.trim() || null,
          source,
        ]
      );

  if ((res.rowCount ?? 0) === 0) throw new Error("Timesheet entry not found.");
  const entry = normalizeEntry(res.rows?.[0] as Record<string, unknown>);
  await recomputeTimesheetTotal(params.headerId);
  return entry;
}

export async function deleteTimesheetEntry(headerId: number, entryId: number) {
  const res = await query(`DELETE FROM timesheet_entries WHERE id = $1 AND header_id = $2`, [entryId, headerId]);
  await recomputeTimesheetTotal(headerId);
  return (res.rowCount ?? 0) > 0;
}

export async function getTimesheetMe(userId: number, entryDate: string) {
  const header = await getOrCreateTimesheetHeader({ userId, entryDate, source: "self" });
  const entries = header ? await getTimesheetEntries(header.id) : [];
  const refreshedHeader = header ? await getTimesheetHeaderById(header.id) : null;
  return { header: refreshedHeader, entries };
}

export async function getTimesheetSummary(entryDate: string) {
  const totalUsersRes = await query(
    `SELECT COUNT(*)::int AS count FROM users WHERE COALESCE(attendance_enabled, TRUE) = TRUE`
  );
  const sheetRes = await query(
    `
    SELECT
      COUNT(*)::int AS total_sheets,
      COUNT(*) FILTER (WHERE status = 'submitted')::int AS submitted_sheets,
      COALESCE(SUM(total_minutes), 0)::int AS total_minutes
    FROM timesheet_headers
    WHERE entry_date = $1::date
    `,
    [entryDate]
  );
  const r = (sheetRes.rows?.[0] as Record<string, unknown>) || {};
  const activeUsers = toNumber((totalUsersRes.rows?.[0] as Record<string, unknown>)?.count, 0);
  const totalSheets = toNumber(r.total_sheets, 0);
  return {
    entry_date: entryDate,
    active_users: activeUsers,
    total_sheets: totalSheets,
    submitted_sheets: toNumber(r.submitted_sheets, 0),
    draft_sheets: Math.max(0, totalSheets - toNumber(r.submitted_sheets, 0)),
    missing_sheets: Math.max(0, activeUsers - totalSheets),
    total_minutes: toNumber(r.total_minutes, 0),
  };
}

export async function getTimesheetRegister(filters: {
  entryDate: string;
  role?: string | null;
  userId?: number | null;
  q?: string | null;
  ticket?: string | null;
}) {
  const where: string[] = ["th.entry_date = $1::date"];
  const params: Array<string | number> = [filters.entryDate];

  if (filters.role && filters.role !== "all") {
    params.push(filters.role);
    where.push(`u.role = $${params.length}`);
  }
  if (filters.userId != null) {
    params.push(filters.userId);
    where.push(`u.id = $${params.length}`);
  }
  if (filters.q?.trim()) {
    params.push(`%${filters.q.trim().toLowerCase()}%`);
    where.push(`(LOWER(u.full_name) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length})`);
  }
  if (filters.ticket?.trim()) {
    params.push(`%${filters.ticket.trim().toLowerCase()}%`);
    where.push(`EXISTS (SELECT 1 FROM timesheet_entries tef WHERE tef.header_id = th.id AND LOWER(tef.ticket_number) LIKE $${params.length})`);
  }

  const res = await query(
    `
    SELECT
      th.id AS header_id,
      th.user_id,
      u.full_name,
      u.email,
      COALESCE(u.role, 'user') AS role,
      COALESCE(u.attendance_enabled, TRUE) AS attendance_enabled,
      th.entry_date::text AS entry_date,
      th.total_minutes,
      th.status,
      th.notes,
      th.updated_at,
      COALESCE(ec.entry_count, 0)::int AS entry_count
    FROM timesheet_headers th
    JOIN users u ON u.id = th.user_id
    LEFT JOIN (
      SELECT header_id, COUNT(*)::int AS entry_count
      FROM timesheet_entries
      GROUP BY header_id
    ) ec ON ec.header_id = th.id
    WHERE ${where.join(" AND ")}
    ORDER BY th.updated_at DESC
    `,
    params
  );

  return (res.rows as Array<Record<string, unknown>>).map((row) => ({
    header_id: toNumber(row.header_id),
    user_id: toNumber(row.user_id),
    full_name: String(row.full_name || ""),
    email: String(row.email || ""),
    role: String(row.role || "user"),
    attendance_enabled: Boolean(row.attendance_enabled),
    entry_date: String(row.entry_date || ""),
    total_minutes: toNumber(row.total_minutes),
    status: String(row.status) === "submitted" ? "submitted" : "draft",
    notes: row.notes ? String(row.notes) : null,
    entry_count: toNumber(row.entry_count),
    updated_at: String(row.updated_at || ""),
  })) as TimesheetRegisterRow[];
}

