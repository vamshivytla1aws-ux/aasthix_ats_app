import { NextResponse } from "next/server";
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
    if (!subject) return NextResponse.json({ error: "subject is required." }, { status: 400 });
    if (!text.trim()) return NextResponse.json({ error: "body is required." }, { status: 400 });
    if (subject.length > MAX_SUBJECT) return NextResponse.json({ error: "subject is too long." }, { status: 400 });
    if (text.length > MAX_BODY) return NextResponse.json({ error: "body is too long." }, { status: 400 });

    const row = await fetchApplicationCardRow(applicationId, user.user_id);
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

    const existingAttendees = Array.isArray(card.interview_attendee_emails)
      ? card.interview_attendee_emails.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    const ccAttendees = parsedCc.emails;
    const internalAttendees = Array.from(new Set([...existingAttendees, ...ccAttendees])).slice(0, MAX_RECIPIENTS);

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
      inviteSubject: subject,
      inviteBody: text.trim(),
      inviteMode,
    });

    const syncStatus = String(syncResult.status || "");
    const syncFailed = syncStatus === "calendar_sync_failed" || syncStatus === "google_not_connected";

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

    if (syncFailed) {
      return NextResponse.json(
        {
          error:
            syncResult.error ||
            "Calendar invite failed; reconnect shared Google account or fix scopes.",
          operation_status: "blocked",
          calendar_sync_status: syncStatus,
          email_send_status: "blocked",
          delivery_channel: "google_calendar_only",
          next_action_hint: "Reconnect Google Calendar or fix OAuth scopes before sending the invite.",
        },
        { status: 409 }
      );
    }

    await writeAuditLog({
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
    });

    if (Number.isFinite(candidateId) && candidateId > 0) {
      try {
        await query(
          `
          INSERT INTO candidate_activity (candidate_id, type, description, created_at)
          VALUES ($1, 'Interview', $2, NOW())
          `,
          [candidateId, "Interview invite sent from ATS board"]
        );
      } catch {
        // legacy optional table
      }
      try {
        await query(
          `
          INSERT INTO activity_timeline (user_id, candidate_id, application_id, event_type, message, metadata)
          VALUES ($1, $2, $3, 'Interview', $4, '{}'::jsonb)
          `,
          [user.user_id, candidateId, applicationId, "Interview invite sent from ATS board"]
        );
      } catch {
        // optional table guard
      }
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      operation_status: "success",
      calendar_sync_status: syncStatus || "invite_sent",
      email_send_status: "sent_via_google_calendar",
      delivery_channel: "google_calendar_only",
      invite_mode: inviteMode,
      meet_link: syncResult.meet_link,
      external_calendar_event_id: syncResult.external_calendar_event_id,
      next_action_hint: "Track interview progress from Pipeline or Interviews desk.",
    });
  } catch (error) {
    console.error("POST /api/applications/[id]/send-interview-invite", error);
    return NextResponse.json(
      {
        error: "Failed to send interview invite.",
        operation_status: "error",
        calendar_sync_status: "unknown",
        email_send_status: "unknown",
        delivery_channel: "google_calendar_only",
        next_action_hint: "Retry after checking server logs.",
      },
      { status: 500 }
    );
  }
}
