import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { requirePermission } from "@/lib/rbac";
import { fetchApplicationCardRow } from "@/lib/applicationCard";
import { writeAuditLog } from "@/lib/auditLog";
import { query } from "@/lib/db";
import { syncInterviewMeeting } from "@/lib/services/googleCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 100_000;
const MAX_SUBJECT = 998;
const MAX_RECIPIENTS = 15;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildServerTiming(timings: Record<string, number>) {
  return Object.entries(timings)
    .filter(([, duration]) => Number.isFinite(duration))
    .map(([key, duration]) => `${key.replace(/[^a-z0-9_]/gi, "_")};dur=${duration}`)
    .join(", ");
}

function parseRecipients(raw: unknown, label: string): { ok: true; emails: string[] } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw.trim()) {
    if (label === "to") return { ok: false, error: "to is required (comma-separated email addresses)." };
    return { ok: true, emails: [] };
  }
  const parts = raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length > MAX_RECIPIENTS) {
    return { ok: false, error: `At most ${MAX_RECIPIENTS} ${label} recipients allowed.` };
  }
  const emails: string[] = [];
  for (const part of parts) {
    if (!EMAIL_RE.test(part)) {
      return { ok: false, error: `Invalid ${label} email: ${part}` };
    }
    emails.push(part.toLowerCase());
  }
  return { ok: true, emails: [...new Set(emails)] };
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const requestStartedAt = performance.now();
  const timings: Record<string, number> = {};
  let deliveryAttempt: { applicationId: number; idempotencyKey: string } | null = null;
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const applicationId = Number(context.params.id);
    if (!Number.isFinite(applicationId) || applicationId <= 0) {
      return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      to?: unknown;
      cc?: unknown;
      subject?: unknown;
      body?: unknown;
      invite_mode?: unknown;
      meeting_mode?: unknown;
      meeting_location?: unknown;
      duration_minutes?: unknown;
      allow_email_fallback?: unknown;
      idempotency_key?: unknown;
    };

    const parsedTo = parseRecipients(body.to, "to");
    if (!parsedTo.ok) {
      return NextResponse.json({ error: parsedTo.error }, { status: 400 });
    }
    const parsedCc = parseRecipients(body.cc, "cc");
    if (!parsedCc.ok) {
      return NextResponse.json({ error: parsedCc.error }, { status: 400 });
    }

    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const text = typeof body.body === "string" ? body.body : "";
    const inviteMode = body.invite_mode === "rescheduled" ? "rescheduled" : "scheduled";
    const durationMinutes = [15, 30, 45, 60].includes(Number(body.duration_minutes)) ? Number(body.duration_minutes) : 60;
    const idempotencyKey = String(body.idempotency_key || randomUUID()).trim().slice(0, 160);
    if (!subject) return NextResponse.json({ error: "subject is required." }, { status: 400 });
    if (!text.trim()) return NextResponse.json({ error: "body is required." }, { status: 400 });
    if (subject.length > MAX_SUBJECT) return NextResponse.json({ error: "subject is too long." }, { status: 400 });
    if (text.length > MAX_BODY) return NextResponse.json({ error: "body is too long." }, { status: 400 });

    const fetchStartedAt = performance.now();
    const row = await fetchApplicationCardRow(applicationId, user.user_id);
    timings.fetch_application_ms = Math.round(performance.now() - fetchStartedAt);
    if (!row) {
      return NextResponse.json({ error: "Application not found or not accessible." }, { status: 404 });
    }

    const card = row as {
      id?: number;
      candidate_id?: number;
      stage?: string | null;
      interview_datetime?: string | null;
      interview_status_note?: string | null;
      interview_attendee_emails?: unknown;
      external_calendar_event_id?: string | null;
      meet_link?: string | null;
      candidate_full_name?: string | null;
      candidate_email?: string | null;
      job_title?: string | null;
      job_location?: string | null;
    };

    const candidateEmail = String(card.candidate_email || "").trim().toLowerCase();
    const candidateId = Number(card.candidate_id);
    if (!candidateEmail || !EMAIL_RE.test(candidateEmail)) {
      return NextResponse.json(
        {
          error: "Candidate email is missing or invalid for calendar invite.",
          operation_status: "blocked",
          calendar_sync_status: "blocked_missing_candidate_email",
          email_send_status: "blocked",
          next_action_hint: "Update candidate email and retry invite send.",
        },
        { status: 400 }
      );
    }
    if (parsedTo.emails.length !== 1 || parsedTo.emails[0] !== candidateEmail) {
      return NextResponse.json({ error: "The primary recipient must match the candidate profile email." }, { status: 400 });
    }

    const recipientHash = createHash("sha256").update([candidateEmail, ...parsedCc.emails].sort().join("|")).digest("hex");
    let claim: { rows: unknown[] };
    try {
      claim = await query(
        `INSERT INTO interview_invitation_deliveries
       (application_id, idempotency_key, invite_mode, scheduled_at, recipient_hash, subject_preview,
        status, created_by_user_id)
       VALUES ($1,$2,$3,$4::timestamptz,$5,$6,'pending',$7)
       ON CONFLICT (application_id, idempotency_key)
       DO UPDATE SET status='pending', attempt_count=interview_invitation_deliveries.attempt_count+1,
                     error_category=NULL, error_detail=NULL, updated_at=NOW()
        WHERE interview_invitation_deliveries.status='failed'
           OR (interview_invitation_deliveries.status='pending' AND interview_invitation_deliveries.updated_at < NOW() - INTERVAL '5 minutes')
        RETURNING status`,
        [applicationId, idempotencyKey, inviteMode, card.interview_datetime, recipientHash, subject.slice(0, 200), user.user_id],
      );
    } catch (error) {
      console.error("Interview delivery tracking is unavailable", error);
      return NextResponse.json({
        error: "Interview invitation tracking is not ready. Apply migration 0098 and retry.",
        schedule_saved: true,
        operation_status: "configuration_error",
        calendar_sync_status: "not_attempted",
        email_send_status: "not_attempted",
        delivery_channel: "none",
        retry_allowed: true,
        next_action_hint: "Run database migration 0098_interview_invitation_delivery.sql.",
      }, { status: 503 });
    }
    deliveryAttempt = { applicationId, idempotencyKey };
    if (claim.rows.length === 0) {
      const previous = await query(
        `SELECT status, delivery_channel, calendar_sync_status, email_send_status, email_provider,
                external_calendar_event_id, meet_link, error_detail
         FROM interview_invitation_deliveries
         WHERE application_id=$1 AND idempotency_key=$2 LIMIT 1`,
        [applicationId, idempotencyKey],
      ).then((result: { rows: unknown[] }) => result.rows[0] as Record<string, unknown> | undefined).catch(() => undefined);
      if (previous && (previous.status === "sent" || previous.status === "sent_with_warning")) {
        return NextResponse.json({
          ok: true, sent: true, schedule_saved: true, idempotent_replay: true,
          operation_status: previous.status === "sent_with_warning" ? "success_with_warning" : "success",
          delivery_channel: previous.delivery_channel, calendar_sync_status: previous.calendar_sync_status,
          email_send_status: previous.email_send_status, email_provider: previous.email_provider,
          meet_link: previous.meet_link, external_calendar_event_id: previous.external_calendar_event_id,
          delivery_warning: previous.error_detail, retry_allowed: false,
        });
      }
      return NextResponse.json({
        error: "This invitation delivery is already in progress.", schedule_saved: true,
        operation_status: "processing", delivery_channel: "pending", retry_allowed: true,
        next_action_hint: "Wait a moment and retry; the same request will not send a duplicate invitation.",
      }, { status: 409 });
    }

    const existingAttendees = Array.isArray(card.interview_attendee_emails)
      ? card.interview_attendee_emails.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    const ccAttendees = parsedCc.emails;
    const internalAttendees = Array.from(new Set([...existingAttendees, ...ccAttendees])).slice(0, MAX_RECIPIENTS);

    const syncStartedAt = performance.now();
    const syncResult = await syncInterviewMeeting({
      action: "upsert",
      applicationId,
      title: String(card.job_title || "Interview"),
      candidateName: String(card.candidate_full_name || "Candidate"),
      candidateEmail,
      interviewDatetime: card.interview_datetime || null,
      internalAttendeeEmails: internalAttendees,
      existingEventId: card.external_calendar_event_id || null,
      existingMeetLink: card.meet_link || null,
      notes: card.interview_status_note || null,
      durationMinutes,
      inviteSubject: subject,
      inviteBody: text.trim(),
      inviteMode,
    });
    timings.calendar_sync_ms = Math.round(performance.now() - syncStartedAt);

    const syncStatus = String(syncResult.status || "");
    const syncFailed = syncStatus === "calendar_sync_failed" || syncStatus === "google_not_connected";

    const persistStartedAt = performance.now();
    await query(
      `
      UPDATE applications
      SET
        calendar_provider = $2,
        external_calendar_event_id = $3,
        meet_link = $4,
        calendar_organizer_email = $5,
        calendar_last_synced_at = $6::timestamptz,
        calendar_sync_status = $7,
        calendar_sync_error = $8,
        interview_attendee_emails = $9::jsonb,
        updated_at = NOW()
      WHERE id = $1
      `,
      [
        applicationId,
        syncResult.source === "google_calendar" || syncStatus !== "google_not_connected" ? "google" : null,
        syncResult.external_calendar_event_id,
        syncResult.meet_link,
        syncResult.organizer_email,
        syncResult.synced_at,
        syncStatus || null,
        syncResult.error || null,
        JSON.stringify(syncResult.attendee_emails || []),
      ]
    );
    timings.persist_application_ms = Math.round(performance.now() - persistStartedAt);

    if (syncFailed) {
      const detail = syncResult.error || "Google Calendar invitation failed.";
      await query(
        `UPDATE interview_invitation_deliveries SET status='failed', delivery_channel='none',
         calendar_sync_status=$3, email_send_status='not_attempted', error_category='google_calendar_failed',
         error_detail=$4, updated_at=NOW() WHERE application_id=$1 AND idempotency_key=$2`,
        [applicationId, idempotencyKey, syncStatus, detail.slice(0, 2000)],
      );
      return NextResponse.json({
        error: detail, schedule_saved: true,
        operation_status: "error", calendar_sync_status: syncStatus, email_send_status: "not_attempted",
        delivery_channel: "none", retry_allowed: true,
        next_action_hint: syncStatus === "google_not_connected"
          ? "Connect the shared Google Calendar account in Settings, then retry this invitation."
          : "Test the shared Google Calendar connection in Settings, then retry this invitation.",
      }, { status: 409 });
    }

    const postSendStartedAt = performance.now();
    const followUps: Promise<unknown>[] = [
      writeAuditLog({
        actorUserId: user.user_id,
        action: "application_interview_invite.sent",
        metadata: {
          application_id: applicationId,
          recipient_count: parsedTo.emails.length,
          cc_count: parsedCc.emails.length,
          subject_preview: subject.slice(0, 120),
          delivery_channel: "google_calendar_only",
          invite_mode: inviteMode,
        },
      }),
    ];

    if (Number.isFinite(candidateId) && candidateId > 0) {
      followUps.push(
        query(
          `
          INSERT INTO candidate_activity (candidate_id, type, description, created_at)
          VALUES ($1, 'Interview', $2, NOW())
          `,
          [candidateId, "Interview invite sent from ATS board"]
        ).catch(() => null)
      );
      followUps.push(
        query(
          `
          INSERT INTO activity_timeline (user_id, candidate_id, application_id, event_type, message, metadata)
          VALUES ($1, $2, $3, 'Interview', $4, '{}'::jsonb)
          `,
          [user.user_id, candidateId, applicationId, "Interview invite sent from ATS board"]
        ).catch(() => null)
      );
    }
    await Promise.allSettled(followUps);
    await query(
      `UPDATE interview_invitation_deliveries
       SET status='sent', delivery_channel='google_calendar', calendar_sync_status=$3,
           email_send_status='sent_via_google_calendar', external_calendar_event_id=$4,
           meet_link=$5, completed_at=NOW(), updated_at=NOW()
       WHERE application_id=$1 AND idempotency_key=$2`,
      [applicationId, idempotencyKey, syncStatus, syncResult.external_calendar_event_id, syncResult.meet_link],
    ).catch(() => null);
    timings.post_send_writes_ms = Math.round(performance.now() - postSendStartedAt);
    timings.total_ms = Math.round(performance.now() - requestStartedAt);

    const response = NextResponse.json({
      ok: true,
      sent: true,
      schedule_saved: true,
      operation_status: "success",
      calendar_sync_status: syncStatus || "invite_sent",
      email_send_status: "sent_via_google_calendar",
      delivery_channel: "google_calendar",
      email_provider: "google_calendar",
      invite_mode: inviteMode,
      meet_link: syncResult.meet_link,
      external_calendar_event_id: syncResult.external_calendar_event_id,
      next_action_hint: "Track interview progress from Pipeline or Interviews desk.",
      delivery_warning: null,
      retry_allowed: false,
    });
    const serverTiming = buildServerTiming(timings);
    if (serverTiming) response.headers.set("Server-Timing", serverTiming);
    console.info("send-interview-invite timing", { applicationId, inviteMode, timings });
    return response;
  } catch (error) {
    console.error("POST /api/applications/[id]/send-interview-invite", error);
    if (deliveryAttempt) {
      await query(
        `UPDATE interview_invitation_deliveries SET status='failed', delivery_channel='none',
         calendar_sync_status='unknown', email_send_status='not_attempted', error_category='unexpected_error',
         error_detail='Unexpected invitation delivery error', updated_at=NOW()
         WHERE application_id=$1 AND idempotency_key=$2`,
        [deliveryAttempt.applicationId, deliveryAttempt.idempotencyKey],
      ).catch(() => null);
    }
    return NextResponse.json(
      {
        error: "Failed to send interview invite.",
        operation_status: "error",
        calendar_sync_status: "unknown",
        email_send_status: "not_attempted",
        delivery_channel: "none",
        schedule_saved: true,
        retry_allowed: true,
        next_action_hint: "Retry after checking server logs.",
      },
      { status: 500 }
    );
  }
}
