import crypto from "node:crypto";
import { query } from "@/lib/db";
import { buildPublicUrl } from "@/lib/publicUrl";
import { ATS_TIMEZONE } from "@/lib/timezones";

type RawCalendarConnection = {
  id: number;
  user_id: number;
  provider: string;
  refresh_token_enc: string | null;
  access_token_enc: string | null;
  token_expires_at: string | null;
  calendar_id: string | null;
  sync_enabled: boolean;
  updated_at: string | null;
  is_shared_account?: boolean | null;
  account_email?: string | null;
  account_name?: string | null;
  sync_error?: string | null;
};

export type SharedGoogleCalendarStatus = {
  connected: boolean;
  configured: boolean;
  account_email: string | null;
  account_name: string | null;
  calendar_id: string | null;
  updated_at: string | null;
  sync_error: string | null;
};

export type InterviewCalendarSyncResult = {
  status:
    | "meet_created"
    | "invite_sent"
    | "calendar_sync_failed"
    | "google_not_connected"
    | "calendar_event_cancelled";
  source: "google_calendar" | "ats_only";
  meet_link: string | null;
  external_calendar_event_id: string | null;
  organizer_email: string | null;
  synced_at: string | null;
  error: string | null;
  attendee_emails: string[];
};

export type TeamCalendarRecurrence = "none" | "daily" | "weekly" | "monthly";

export type TeamCalendarSyncResult = {
  status: "scheduled" | "updated" | "cancelled" | "sync_failed" | "google_not_connected";
  source: "google_calendar" | "ats_only";
  meet_link: string | null;
  external_calendar_event_id: string | null;
  organizer_email: string | null;
  synced_at: string | null;
  error: string | null;
  attendee_emails: string[];
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

type SharedGoogleConnection = RawCalendarConnection & {
  access_token: string | null;
  refresh_token: string | null;
};

const GOOGLE_AUTH_SCOPE = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

function tokenSecret() {
  const secret =
    process.env.CALENDAR_TOKEN_SECRET ||
    process.env.JWT_SECRET ||
    process.env.CRON_SECRET ||
    "";
  if (!secret.trim()) {
    throw new Error("Calendar token encryption secret is not configured");
  }
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

function encryptToken(value: string | null | undefined) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  });
}

function decryptToken(payload: string | null | undefined) {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as { iv: string; tag: string; data: string };
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      tokenSecret(),
      Buffer.from(parsed.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(parsed.data, "base64")),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

function calendarRedirectUri() {
  return buildPublicUrl("/api/settings/calendar/google/callback");
}

function googleClientId() {
  return String(process.env.GOOGLE_CLIENT_ID || "").trim();
}

function googleClientSecret() {
  return String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
}

function googleConfigured() {
  return Boolean(googleClientId() && googleClientSecret());
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function uniqueEmails(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .map(normalizeEmail)
    )
  );
}

function toCalendarLocalDateTime(value: string | Date, timeZone = ATS_TIMEZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid calendar datetime");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

async function exchangeCodeForTokens(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    redirect_uri: calendarRedirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to exchange Google auth code (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to refresh Google access token (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as GoogleTokenResponse;
}

async function googleApi<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://www.googleapis.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google API error (${res.status}): ${text || res.statusText}`);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

async function fetchGoogleProfile(accessToken: string) {
  return await googleApi<{ email?: string; name?: string }>(
    "/oauth2/v2/userinfo",
    accessToken,
    { method: "GET" }
  );
}

export function buildGoogleConnectUrl(state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", googleClientId());
  url.searchParams.set("redirect_uri", calendarRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_AUTH_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

async function loadSharedGoogleRow() {
  const res = await query(
    `
    SELECT
      id,
      user_id,
      provider,
      refresh_token_enc,
      access_token_enc,
      token_expires_at,
      calendar_id,
      sync_enabled,
      updated_at,
      is_shared_account,
      account_email,
      account_name,
      sync_error
    FROM user_calendar_connections
    WHERE provider = 'google'
      AND is_shared_account = TRUE
    ORDER BY updated_at DESC NULLS LAST, id DESC
    LIMIT 1
    `
  );
  return (res.rows?.[0] as RawCalendarConnection | undefined) ?? null;
}

async function persistSharedGoogleTokens(connectionId: number, patch: {
  access_token?: string | null;
  refresh_token?: string | null;
  expires_at?: string | null;
  sync_error?: string | null;
}) {
  await query(
    `
    UPDATE user_calendar_connections
    SET
      access_token_enc = COALESCE($2, access_token_enc),
      refresh_token_enc = COALESCE($3, refresh_token_enc),
      token_expires_at = COALESCE($4::timestamptz, token_expires_at),
      sync_error = $5,
      updated_at = NOW()
    WHERE id = $1
    `,
    [
      connectionId,
      patch.access_token === undefined ? null : encryptToken(patch.access_token),
      patch.refresh_token === undefined ? null : encryptToken(patch.refresh_token),
      patch.expires_at ?? null,
      patch.sync_error ?? null,
    ]
  );
}

export async function upsertSharedGoogleConnection(input: {
  userId: number;
  accessToken: string;
  refreshToken: string | null;
  expiresInSec?: number;
  accountEmail: string | null;
  accountName: string | null;
}) {
  const existing = await loadSharedGoogleRow();
  const expiresAt =
    typeof input.expiresInSec === "number" && Number.isFinite(input.expiresInSec)
      ? new Date(Date.now() + Math.max(60, input.expiresInSec - 60) * 1000).toISOString()
      : null;

  if (existing) {
    await query(
      `
      UPDATE user_calendar_connections
      SET
        user_id = $2,
        refresh_token_enc = COALESCE($3, refresh_token_enc),
        access_token_enc = $4,
        token_expires_at = $5::timestamptz,
        sync_enabled = TRUE,
        calendar_id = COALESCE(calendar_id, $6),
        account_email = $7,
        account_name = $8,
        sync_error = NULL,
        updated_at = NOW()
      WHERE id = $1
      `,
      [
        existing.id,
        input.userId,
        input.refreshToken ? encryptToken(input.refreshToken) : null,
        encryptToken(input.accessToken),
        expiresAt,
        process.env.GOOGLE_CALENDAR_ID || "primary",
        input.accountEmail,
        input.accountName,
      ]
    );
    return;
  }

  await query(
    `
    INSERT INTO user_calendar_connections (
      user_id,
      provider,
      refresh_token_enc,
      access_token_enc,
      token_expires_at,
      calendar_id,
      sync_enabled,
      is_shared_account,
      account_email,
      account_name,
      sync_error
    )
    VALUES ($1, 'google', $2, $3, $4::timestamptz, $5, TRUE, TRUE, $6, $7, NULL)
    `,
    [
      input.userId,
      input.refreshToken ? encryptToken(input.refreshToken) : null,
      encryptToken(input.accessToken),
      expiresAt,
      process.env.GOOGLE_CALENDAR_ID || "primary",
      input.accountEmail,
      input.accountName,
    ]
  );
}

export async function disconnectSharedGoogleConnection() {
  await query(
    `
    DELETE FROM user_calendar_connections
    WHERE provider = 'google'
      AND is_shared_account = TRUE
    `
  );
}

export async function getSharedGoogleCalendarStatus(): Promise<SharedGoogleCalendarStatus> {
  const row = await loadSharedGoogleRow();
  return {
    connected: Boolean(row?.sync_enabled),
    configured: googleConfigured(),
    account_email: row?.account_email ?? null,
    account_name: row?.account_name ?? null,
    calendar_id: row?.calendar_id ?? (process.env.GOOGLE_CALENDAR_ID || "primary"),
    updated_at: row?.updated_at ?? null,
    sync_error: row?.sync_error ?? null,
  };
}

export async function requireSharedGoogleConnection(): Promise<SharedGoogleConnection | null> {
  const row = await loadSharedGoogleRow();
  if (!row || !row.sync_enabled) return null;
  return {
    ...row,
    access_token: decryptToken(row.access_token_enc),
    refresh_token: decryptToken(row.refresh_token_enc),
  };
}

async function ensureUsableGoogleAccessToken(connection: SharedGoogleConnection) {
  const expiryMs = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (connection.access_token && expiryMs > Date.now() + 60_000) {
    return connection.access_token;
  }
  if (!connection.refresh_token) {
    throw new Error("Shared Google Calendar account needs to be reconnected");
  }
  const refreshed = await refreshAccessToken(connection.refresh_token);
  if (!refreshed.access_token) {
    throw new Error("Google token refresh did not return an access token");
  }
  const refreshedExpiry =
    typeof refreshed.expires_in === "number"
      ? new Date(Date.now() + Math.max(60, refreshed.expires_in - 60) * 1000).toISOString()
      : null;
  await persistSharedGoogleTokens(connection.id, {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? undefined,
    expires_at: refreshedExpiry,
    sync_error: null,
  });
  connection.access_token = refreshed.access_token;
  connection.token_expires_at = refreshedExpiry;
  if (refreshed.refresh_token) connection.refresh_token = refreshed.refresh_token;
  return refreshed.access_token;
}

type SyncInterviewMeetingInput = {
  action: "upsert" | "cancel";
  applicationId: number;
  title: string;
  candidateName: string;
  candidateEmail: string | null;
  organizerHint?: string | null;
  interviewDatetime: string | null;
  internalAttendeeEmails: string[];
  existingEventId?: string | null;
  existingMeetLink?: string | null;
  notes?: string | null;
  durationMinutes?: number | null;
  inviteSubject?: string | null;
  inviteBody?: string | null;
  inviteMode?: "scheduled" | "rescheduled" | null;
};

type SyncTeamCalendarMeetingInput = {
  action: "upsert" | "cancel";
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  attendeeEmails: string[];
  existingEventId?: string | null;
  existingMeetLink?: string | null;
  recurrence?: TeamCalendarRecurrence;
  recurrenceUntil?: string | null;
};

function toRruleUntil(recurringUntil: string) {
  const d = new Date(`${recurringUntil}T23:59:59+05:30`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildRecurrenceRule(freq: TeamCalendarRecurrence, recurringUntil?: string | null) {
  if (!freq || freq === "none") return undefined;
  const until = recurringUntil ? toRruleUntil(recurringUntil) : null;
  const rule = `RRULE:FREQ=${freq.toUpperCase()}${until ? `;UNTIL=${until}` : ""}`;
  return [rule];
}

export async function syncInterviewMeeting(input: SyncInterviewMeetingInput): Promise<InterviewCalendarSyncResult> {
  const status = await getSharedGoogleCalendarStatus();
  const attendees = uniqueEmails([input.candidateEmail, ...input.internalAttendeeEmails]);
  if (!status.configured || !status.connected) {
    return {
      status: "google_not_connected",
      source: "ats_only",
      meet_link: input.existingMeetLink ?? null,
      external_calendar_event_id: input.existingEventId ?? null,
      organizer_email: status.account_email,
      synced_at: null,
      error: !status.configured
        ? "Google Calendar OAuth environment is not configured"
        : "Shared Google Calendar account is not connected",
      attendee_emails: attendees,
    };
  }

  const connection = await requireSharedGoogleConnection();
  if (!connection) {
    return {
      status: "google_not_connected",
      source: "ats_only",
      meet_link: input.existingMeetLink ?? null,
      external_calendar_event_id: input.existingEventId ?? null,
      organizer_email: status.account_email,
      synced_at: null,
      error: "Shared Google Calendar account is not connected",
      attendee_emails: attendees,
    };
  }

  try {
    const accessToken = await ensureUsableGoogleAccessToken(connection);
    const calendarId = encodeURIComponent(connection.calendar_id || process.env.GOOGLE_CALENDAR_ID || "primary");

    if (input.action === "cancel") {
      if (input.existingEventId) {
        await googleApi<null>(
          `/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(input.existingEventId)}?sendUpdates=all`,
          accessToken,
          { method: "DELETE" }
        );
      }
      return {
        status: "calendar_event_cancelled",
        source: "google_calendar",
        meet_link: null,
        external_calendar_event_id: null,
        organizer_email: connection.account_email ?? null,
        synced_at: new Date().toISOString(),
        error: null,
        attendee_emails: attendees,
      };
    }

    if (!input.interviewDatetime) {
      throw new Error("Interview datetime is required to create Google Meet");
    }

    const start = new Date(input.interviewDatetime);
    const normalizedDuration =
      input.durationMinutes === 15 ||
      input.durationMinutes === 30 ||
      input.durationMinutes === 45 ||
      input.durationMinutes === 60
        ? input.durationMinutes
        : 60;
    const end = new Date(start.getTime() + normalizedDuration * 60 * 1000);
    const descriptionLines = [
      `Candidate: ${input.candidateName}`,
      `Role: ${input.title}`,
      "",
      input.inviteMode === "rescheduled"
        ? "This interview was rescheduled from AASTHIX ATS. Please use this latest calendar invite."
        : "This interview was scheduled from AASTHIX ATS.",
    ];
    if (input.notes) {
      descriptionLines.push("", input.notes);
    }
    const inviteBody = String(input.inviteBody || "").trim();
    if (inviteBody) {
      descriptionLines.push("", "ATS Invitation Message:", inviteBody);
    }

    const summaryText = String(input.inviteSubject || "").trim() || `${input.title} - ${input.candidateName}`;
    const payload = {
      summary: summaryText,
      description: descriptionLines.join("\n"),
      start: { dateTime: toCalendarLocalDateTime(start), timeZone: ATS_TIMEZONE },
      end: { dateTime: toCalendarLocalDateTime(end), timeZone: ATS_TIMEZONE },
      attendees: attendees.map((email) => ({ email })),
      conferenceData: input.existingEventId
        ? undefined
        : {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
    };

    const method = input.existingEventId ? "PATCH" : "POST";
    const path = input.existingEventId
      ? `/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(input.existingEventId)}?conferenceDataVersion=1&sendUpdates=all`
      : `/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`;

    const event = await googleApi<{
      id?: string;
      hangoutLink?: string;
      conferenceData?: {
        entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
      };
    }>(path, accessToken, {
      method,
      body: JSON.stringify(payload),
    });

    const meetLink =
      event.hangoutLink ||
      event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri ||
      input.existingMeetLink ||
      null;

    return {
      status: input.existingEventId ? "invite_sent" : "meet_created",
      source: "google_calendar",
      meet_link: meetLink,
      external_calendar_event_id: event.id ?? input.existingEventId ?? null,
      organizer_email: connection.account_email ?? null,
      synced_at: new Date().toISOString(),
      error: null,
      attendee_emails: attendees,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync Google Calendar event";
    if (connection.id) {
      await query(
        `
        UPDATE user_calendar_connections
        SET sync_error = $2, updated_at = NOW()
        WHERE id = $1
        `,
        [connection.id, message.slice(0, 4000)]
      );
    }
    return {
      status: "calendar_sync_failed",
      source: "google_calendar",
      meet_link: input.existingMeetLink ?? null,
      external_calendar_event_id: input.existingEventId ?? null,
      organizer_email: connection.account_email ?? null,
      synced_at: new Date().toISOString(),
      error: message,
      attendee_emails: attendees,
    };
  }
}

export async function syncTeamCalendarMeeting(input: SyncTeamCalendarMeetingInput): Promise<TeamCalendarSyncResult> {
  const status = await getSharedGoogleCalendarStatus();
  const attendees = uniqueEmails(input.attendeeEmails);
  if (!status.configured || !status.connected) {
    return {
      status: "google_not_connected",
      source: "ats_only",
      meet_link: input.existingMeetLink ?? null,
      external_calendar_event_id: input.existingEventId ?? null,
      organizer_email: status.account_email,
      synced_at: null,
      error: !status.configured
        ? "Google Calendar OAuth environment is not configured"
        : "Shared Google Calendar account is not connected",
      attendee_emails: attendees,
    };
  }

  const connection = await requireSharedGoogleConnection();
  if (!connection) {
    return {
      status: "google_not_connected",
      source: "ats_only",
      meet_link: input.existingMeetLink ?? null,
      external_calendar_event_id: input.existingEventId ?? null,
      organizer_email: status.account_email,
      synced_at: null,
      error: "Shared Google Calendar account is not connected",
      attendee_emails: attendees,
    };
  }

  try {
    const accessToken = await ensureUsableGoogleAccessToken(connection);
    const calendarId = encodeURIComponent(connection.calendar_id || process.env.GOOGLE_CALENDAR_ID || "primary");

    if (input.action === "cancel") {
      if (input.existingEventId) {
        await googleApi<null>(
          `/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(input.existingEventId)}?sendUpdates=all`,
          accessToken,
          { method: "DELETE" }
        );
      }
      return {
        status: "cancelled",
        source: "google_calendar",
        meet_link: null,
        external_calendar_event_id: null,
        organizer_email: connection.account_email ?? null,
        synced_at: new Date().toISOString(),
        error: null,
        attendee_emails: attendees,
      };
    }

    const payload = {
      summary: String(input.title || "Internal meeting").trim(),
      description: String(input.description || "").trim(),
      start: { dateTime: toCalendarLocalDateTime(input.startAt), timeZone: ATS_TIMEZONE },
      end: { dateTime: toCalendarLocalDateTime(input.endAt), timeZone: ATS_TIMEZONE },
      attendees: attendees.map((email) => ({ email })),
      recurrence: buildRecurrenceRule(input.recurrence || "none", input.recurrenceUntil),
      conferenceData: input.existingEventId
        ? undefined
        : {
            createRequest: {
              requestId: crypto.randomUUID(),
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
    };

    const method = input.existingEventId ? "PATCH" : "POST";
    const path = input.existingEventId
      ? `/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(input.existingEventId)}?conferenceDataVersion=1&sendUpdates=all`
      : `/calendar/v3/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`;

    const event = await googleApi<{
      id?: string;
      hangoutLink?: string;
      conferenceData?: { entryPoints?: Array<{ entryPointType?: string; uri?: string }> };
    }>(path, accessToken, {
      method,
      body: JSON.stringify(payload),
    });

    const meetLink =
      event.hangoutLink ||
      event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri ||
      input.existingMeetLink ||
      null;

    return {
      status: input.existingEventId ? "updated" : "scheduled",
      source: "google_calendar",
      meet_link: meetLink,
      external_calendar_event_id: event.id ?? input.existingEventId ?? null,
      organizer_email: connection.account_email ?? null,
      synced_at: new Date().toISOString(),
      error: null,
      attendee_emails: attendees,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync Google Calendar event";
    if (connection.id) {
      await query(
        `
        UPDATE user_calendar_connections
        SET sync_error = $2, updated_at = NOW()
        WHERE id = $1
        `,
        [connection.id, message.slice(0, 4000)]
      );
    }
    return {
      status: "sync_failed",
      source: "google_calendar",
      meet_link: input.existingMeetLink ?? null,
      external_calendar_event_id: input.existingEventId ?? null,
      organizer_email: connection.account_email ?? null,
      synced_at: new Date().toISOString(),
      error: message,
      attendee_emails: attendees,
    };
  }
}

export async function completeGoogleOAuth(input: { code: string; userId: number }) {
  if (!googleConfigured()) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured");
  }
  const tokenData = await exchangeCodeForTokens(input.code);
  if (!tokenData.access_token) {
    throw new Error("Google OAuth did not return an access token");
  }
  const profile = await fetchGoogleProfile(tokenData.access_token);
  await upsertSharedGoogleConnection({
    userId: input.userId,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? null,
    expiresInSec: tokenData.expires_in,
    accountEmail: profile.email ?? null,
    accountName: profile.name ?? null,
  });
  return {
    email: profile.email ?? null,
    name: profile.name ?? null,
  };
}
