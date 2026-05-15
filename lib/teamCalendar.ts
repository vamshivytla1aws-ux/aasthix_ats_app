import { query } from "@/lib/db";
import { ATS_TIMEZONE } from "@/lib/timezones";
import { syncTeamCalendarMeeting, type TeamCalendarRecurrence, type TeamCalendarSyncResult } from "@/lib/services/googleCalendar";

export type TeamCalendarStatus = "scheduled" | "updated" | "cancelled" | "sync_failed";

export type TeamCalendarEvent = {
  id: number;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  recurrence: TeamCalendarRecurrence;
  recurrence_until: string | null;
  attendee_user_ids: number[];
  attendee_emails: string[];
  calendar_provider: "google" | null;
  external_calendar_event_id: string | null;
  meet_link: string | null;
  calendar_organizer_email: string | null;
  calendar_last_synced_at: string | null;
  calendar_sync_status: string | null;
  calendar_sync_error: string | null;
  status: TeamCalendarStatus;
  created_by_user_id: number;
  updated_by_user_id: number;
  created_at: string;
  updated_at: string;
};

type TeamCalendarPayload = {
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  timezone?: string;
  recurrence?: TeamCalendarRecurrence;
  recurrence_until?: string | null;
  attendee_user_ids?: number[];
  attendee_emails?: string[];
};

function uniqueEmails(raw: string[]) {
  const normalized = raw.map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set(normalized));
}

function normalizeUserIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out = raw
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.trunc(value));
  return Array.from(new Set(out));
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function parseRecurrence(value: unknown): TeamCalendarRecurrence {
  const v = String(value || "none").trim().toLowerCase();
  if (v === "daily" || v === "weekly" || v === "monthly") return v;
  return "none";
}

function assertIsoDateTime(value: string, label: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${label} must be a valid ISO date-time.`);
  }
  return d.toISOString();
}

async function resolveAttendeeEmails(userIds: number[], explicitEmails: string[]) {
  if (userIds.length === 0) return uniqueEmails(explicitEmails);
  const params: unknown[] = [userIds];
  const rows = await query(
    `
    SELECT email
    FROM users
    WHERE id = ANY($1::int[]) AND active = TRUE
    `,
    params
  );
  const emailsFromUsers = rows.rows
    .map((row: any) => String((row as { email?: string }).email || "").trim().toLowerCase())
    .filter(Boolean);
  return uniqueEmails([...explicitEmails, ...emailsFromUsers]);
}

function toInsertableStatus(sync: TeamCalendarSyncResult): TeamCalendarStatus {
  if (sync.status === "scheduled") return "scheduled";
  if (sync.status === "updated") return "updated";
  if (sync.status === "cancelled") return "cancelled";
  return "sync_failed";
}

export async function listTeamCalendarEvents(input: { from?: string | null; to?: string | null; q?: string | null }) {
  const where: string[] = ["status <> 'cancelled'"];
  const params: unknown[] = [];
  if (input.from) {
    params.push(input.from);
    where.push(`start_at >= $${params.length}::timestamptz`);
  }
  if (input.to) {
    params.push(input.to);
    where.push(`start_at <= $${params.length}::timestamptz`);
  }
  if (input.q && input.q.trim()) {
    params.push(`%${input.q.trim().toLowerCase()}%`);
    where.push(`(LOWER(title) LIKE $${params.length} OR LOWER(COALESCE(description, '')) LIKE $${params.length})`);
  }

  const rows = await query(
    `
    SELECT
      id, title, description, start_at, end_at, timezone, recurrence, recurrence_until,
      attendee_user_ids, attendee_emails, calendar_provider, external_calendar_event_id, meet_link,
      calendar_organizer_email, calendar_last_synced_at, calendar_sync_status, calendar_sync_error,
      status, created_by_user_id, updated_by_user_id, created_at, updated_at
    FROM team_calendar_events
    WHERE ${where.join(" AND ")}
    ORDER BY start_at ASC
    LIMIT 500
    `,
    params
  );
  return rows.rows as TeamCalendarEvent[];
}

export async function createTeamCalendarEvent(actorUserId: number, payload: TeamCalendarPayload) {
  const title = String(payload.title || "").trim();
  if (!title) throw new Error("title is required.");
  const startAt = assertIsoDateTime(payload.start_at, "start_at");
  const endAt = assertIsoDateTime(payload.end_at, "end_at");
  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    throw new Error("end_at must be after start_at.");
  }

  const recurrence = parseRecurrence(payload.recurrence);
  const recurrenceUntil = recurrence === "none" ? null : parseDateOnly(payload.recurrence_until);
  if (recurrence !== "none" && !recurrenceUntil) {
    throw new Error("recurrence_until is required for recurring meetings.");
  }

  const attendeeUserIds = normalizeUserIds(payload.attendee_user_ids);
  const attendeeEmails = await resolveAttendeeEmails(attendeeUserIds, uniqueEmails(payload.attendee_emails || []));
  if (attendeeEmails.length === 0) {
    throw new Error("At least one attendee email is required.");
  }

  const sync = await syncTeamCalendarMeeting({
    action: "upsert",
    title,
    description: payload.description || null,
    startAt,
    endAt,
    attendeeEmails,
    recurrence,
    recurrenceUntil,
  });
  if (sync.status === "google_not_connected" || sync.status === "sync_failed") {
    throw new Error(sync.error || "Calendar invite failed; reconnect shared Google account or fix scopes.");
  }

  const inserted = await query(
    `
    INSERT INTO team_calendar_events (
      title, description, start_at, end_at, timezone, recurrence, recurrence_until,
      attendee_user_ids, attendee_emails, calendar_provider, external_calendar_event_id, meet_link,
      calendar_organizer_email, calendar_last_synced_at, calendar_sync_status, calendar_sync_error, status,
      created_by_user_id, updated_by_user_id
    )
    VALUES (
      $1, $2, $3::timestamptz, $4::timestamptz, $5, $6, $7::date,
      $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14::timestamptz, $15, $16, $17, $18, $19
    )
    RETURNING
      id, title, description, start_at, end_at, timezone, recurrence, recurrence_until,
      attendee_user_ids, attendee_emails, calendar_provider, external_calendar_event_id, meet_link,
      calendar_organizer_email, calendar_last_synced_at, calendar_sync_status, calendar_sync_error,
      status, created_by_user_id, updated_by_user_id, created_at, updated_at
    `,
    [
      title,
      payload.description || null,
      startAt,
      endAt,
      payload.timezone || ATS_TIMEZONE,
      recurrence,
      recurrenceUntil,
      JSON.stringify(attendeeUserIds),
      JSON.stringify(attendeeEmails),
      "google",
      sync.external_calendar_event_id,
      sync.meet_link,
      sync.organizer_email,
      sync.synced_at,
      sync.status,
      sync.error,
      toInsertableStatus(sync),
      actorUserId,
      actorUserId,
    ]
  );
  return inserted.rows[0] as TeamCalendarEvent;
}

export async function updateTeamCalendarEvent(actorUserId: number, id: number, payload: Partial<TeamCalendarPayload>) {
  const currentResult = await query(
    `
    SELECT
      id, title, description, start_at, end_at, timezone, recurrence, recurrence_until,
      attendee_user_ids, attendee_emails, calendar_provider, external_calendar_event_id, meet_link,
      calendar_organizer_email, calendar_last_synced_at, calendar_sync_status, calendar_sync_error,
      status, created_by_user_id, updated_by_user_id, created_at, updated_at
    FROM team_calendar_events
    WHERE id = $1
    `,
    [id]
  );
  const current = currentResult.rows[0] as TeamCalendarEvent | undefined;
  if (!current) throw new Error("Event not found.");

  const title = payload.title != null ? String(payload.title).trim() : current.title;
  if (!title) throw new Error("title is required.");
  const startAt = payload.start_at ? assertIsoDateTime(payload.start_at, "start_at") : current.start_at;
  const endAt = payload.end_at ? assertIsoDateTime(payload.end_at, "end_at") : current.end_at;
  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    throw new Error("end_at must be after start_at.");
  }

  const recurrence = payload.recurrence ? parseRecurrence(payload.recurrence) : current.recurrence;
  const recurrenceUntilRaw = payload.recurrence_until !== undefined ? payload.recurrence_until : current.recurrence_until;
  const recurrenceUntil = recurrence === "none" ? null : parseDateOnly(recurrenceUntilRaw);
  if (recurrence !== "none" && !recurrenceUntil) {
    throw new Error("recurrence_until is required for recurring meetings.");
  }

  const attendeeUserIds = payload.attendee_user_ids ? normalizeUserIds(payload.attendee_user_ids) : normalizeUserIds(current.attendee_user_ids);
  const attendeeEmails = await resolveAttendeeEmails(
    attendeeUserIds,
    payload.attendee_emails ? uniqueEmails(payload.attendee_emails) : uniqueEmails(current.attendee_emails)
  );
  if (attendeeEmails.length === 0) {
    throw new Error("At least one attendee email is required.");
  }

  const sync = await syncTeamCalendarMeeting({
    action: "upsert",
    title,
    description: payload.description !== undefined ? payload.description || null : current.description,
    startAt,
    endAt,
    attendeeEmails,
    existingEventId: current.external_calendar_event_id,
    existingMeetLink: current.meet_link,
    recurrence,
    recurrenceUntil,
  });
  if (sync.status === "google_not_connected" || sync.status === "sync_failed") {
    throw new Error(sync.error || "Calendar invite failed; reconnect shared Google account or fix scopes.");
  }

  const updated = await query(
    `
    UPDATE team_calendar_events
    SET
      title = $2,
      description = $3,
      start_at = $4::timestamptz,
      end_at = $5::timestamptz,
      timezone = $6,
      recurrence = $7,
      recurrence_until = $8::date,
      attendee_user_ids = $9::jsonb,
      attendee_emails = $10::jsonb,
      calendar_provider = $11,
      external_calendar_event_id = $12,
      meet_link = $13,
      calendar_organizer_email = $14,
      calendar_last_synced_at = $15::timestamptz,
      calendar_sync_status = $16,
      calendar_sync_error = $17,
      status = $18,
      updated_by_user_id = $19,
      updated_at = NOW()
    WHERE id = $1
    RETURNING
      id, title, description, start_at, end_at, timezone, recurrence, recurrence_until,
      attendee_user_ids, attendee_emails, calendar_provider, external_calendar_event_id, meet_link,
      calendar_organizer_email, calendar_last_synced_at, calendar_sync_status, calendar_sync_error,
      status, created_by_user_id, updated_by_user_id, created_at, updated_at
    `,
    [
      id,
      title,
      payload.description !== undefined ? payload.description || null : current.description,
      startAt,
      endAt,
      payload.timezone || current.timezone || ATS_TIMEZONE,
      recurrence,
      recurrenceUntil,
      JSON.stringify(attendeeUserIds),
      JSON.stringify(attendeeEmails),
      "google",
      sync.external_calendar_event_id,
      sync.meet_link,
      sync.organizer_email,
      sync.synced_at,
      sync.status,
      sync.error,
      toInsertableStatus(sync),
      actorUserId,
    ]
  );
  return updated.rows[0] as TeamCalendarEvent;
}

export async function cancelTeamCalendarEvent(actorUserId: number, id: number) {
  const currentResult = await query(
    `SELECT * FROM team_calendar_events WHERE id = $1`,
    [id]
  );
  const current = currentResult.rows[0] as TeamCalendarEvent | undefined;
  if (!current) throw new Error("Event not found.");

  const sync = await syncTeamCalendarMeeting({
    action: "cancel",
    title: current.title,
    description: current.description,
    startAt: current.start_at,
    endAt: current.end_at,
    attendeeEmails: uniqueEmails(current.attendee_emails),
    existingEventId: current.external_calendar_event_id,
    existingMeetLink: current.meet_link,
    recurrence: current.recurrence,
    recurrenceUntil: current.recurrence_until,
  });

  if (sync.status === "google_not_connected" || sync.status === "sync_failed") {
    throw new Error(sync.error || "Calendar cancellation failed; reconnect shared Google account or fix scopes.");
  }

  const updated = await query(
    `
    UPDATE team_calendar_events
    SET
      status = 'cancelled',
      meet_link = $2,
      external_calendar_event_id = $3,
      calendar_organizer_email = $4,
      calendar_last_synced_at = $5::timestamptz,
      calendar_sync_status = $6,
      calendar_sync_error = $7,
      updated_by_user_id = $8,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [id, sync.meet_link, sync.external_calendar_event_id, sync.organizer_email, sync.synced_at, sync.status, sync.error, actorUserId]
  );
  return updated.rows[0] as TeamCalendarEvent;
}
