import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { fetchApplicationCardRow } from "@/lib/applicationCard";
import { sendTransactionalEmail } from "@/lib/sendTransactionalEmail";
import { writeAuditLog } from "@/lib/auditLog";
import { buildCandidateEmailTemplate } from "@/lib/candidateEmailTemplate";
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
    if (!candidateEmail || !EMAIL_RE.test(candidateEmail)) {
      return NextResponse.json({ error: "Candidate email is missing or invalid for calendar invite." }, { status: 400 });
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
          calendar_sync_status: syncStatus,
        },
        { status: 409 }
      );
    }

    const messageParagraphs = text
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean);
    const emailBody = buildCandidateEmailTemplate({
      candidateName: card.candidate_full_name,
      paragraphs: messageParagraphs.length > 0 ? messageParagraphs : [text.trim()],
      job: {
        title: card.job_title,
        location: card.job_location,
      },
    });

    const sendResult = await sendTransactionalEmail({
      to: parsedTo.emails,
      cc: parsedCc.emails,
      subject,
      text: emailBody.text,
      html: emailBody.html,
    });

    if (!sendResult.sent) {
      if (sendResult.reason === "smtp_not_configured") {
        return NextResponse.json(
          { error: "Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL, or configure SMTP variables on the server." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: sendResult.detail || "Failed to send interview invite." }, { status: 502 });
    }

    await writeAuditLog({
      actorUserId: user.user_id,
      action: "application_interview_invite.sent",
      metadata: {
        application_id: applicationId,
        recipient_count: parsedTo.emails.length,
        cc_count: parsedCc.emails.length,
        subject_preview: subject.slice(0, 120),
      },
    });

    return NextResponse.json({
      ok: true,
      sent: true,
      calendar_sync_status: syncStatus || "invite_sent",
      meet_link: syncResult.meet_link,
      external_calendar_event_id: syncResult.external_calendar_event_id,
    });
  } catch (error) {
    console.error("POST /api/applications/[id]/send-interview-invite", error);
    return NextResponse.json({ error: "Failed to send interview invite." }, { status: 500 });
  }
}
