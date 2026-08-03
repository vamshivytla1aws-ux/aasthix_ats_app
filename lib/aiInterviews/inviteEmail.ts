import { query } from "@/lib/db";
import { createSecureInterviewToken, hashInterviewToken } from "@/lib/aiInterviews/token";
import { buildPublicUrl } from "@/lib/publicUrl";
import { sendTransactionalEmail } from "@/lib/sendTransactionalEmail";
import { buildCandidateEmailTemplate } from "@/lib/candidateEmailTemplate";
import { getSharedGoogleCalendarStatus, syncInterviewMeeting } from "@/lib/services/googleCalendar";

function formatIst(value: string | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

/** Returns e.g. "3 August 2026 at 9:30 am" in IST */
function fmtIst(value: string | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export async function sendAiInterviewInviteEmail(interviewId: number, actorUserId: number) {
  const result = await query(
    `SELECT ai.id, ai.title, ai.duration_minutes, ai.expires_at, ai.status, ai.application_id,
            c.full_name AS candidate_name, c.email AS candidate_email,
            j.title AS job_title, j.company AS job_company, j.location AS job_location
       FROM ai_interviews ai
       JOIN candidates c ON c.id = ai.candidate_id
       JOIN jobs j ON j.id = ai.job_id
      WHERE ai.id = $1`,
    [interviewId]
  );
  if (!result.rowCount) {
    return { ok: false, status: 404, error: "AI interview not found" };
  }
  const row = result.rows[0];
  const recipient = String(row.candidate_email || "").trim().toLowerCase();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { ok: false, status: 400, error: "Candidate email is missing or invalid" };
  }
  if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(row.status) || new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, status: 409, error: "This interview can no longer be sent" };
  }

  const token = createSecureInterviewToken();
  const publicUrl = buildPublicUrl(`/ai-interview/${token}`);
  const windowStart = new Date(); // invitation sent now = window opens now
  const windowEnd = new Date(row.expires_at);
  const windowLine = `${fmtIst(windowStart)} IST  →  ${fmtIst(windowEnd)} IST`;
  const subject = `AI Interview Invitation: ${row.job_title} – AASTHIX`;

  let deliveredVia: "google_calendar" | "resend" | "smtp" | null = null;
  let deliveryMessageId: string | null = null;
  let lastErrorDetail: string | null = null;

  // Plain-text body used in both delivery paths.
  const plainBody = [
    `Dear ${row.candidate_name},`,
    "",
    `You are invited to complete an AI-powered technical & behavioural interview for the position of ${row.job_title}.`,
    "",
    `Interview duration: ${row.duration_minutes} minutes`,
    `Interview window: ${windowLine}`,
    "",
    `Start your secure AI Interview: ${publicUrl}`,
    "",
    "Important: This link is single-use. Once you submit your answers the link is permanently deactivated.",
    "",
    "Please complete the interview on a laptop or desktop using Chrome or Edge with camera and microphone. Recording and integrity monitoring begin after your consent.",
    "",
    "Our recruiters will reach out to you based on the evaluation.",
    "",
    "Regards,",
    "AASTHIX Talent Team",
  ].join("\n");

  // 1. Primary: Google Calendar — sends the email to the candidate WITHOUT a Meet link.
  //    skipConferencing: true prevents a Google Meet from being attached to the event.
  const gcalStatus = await getSharedGoogleCalendarStatus();
  if (gcalStatus.configured && gcalStatus.connected) {
    try {
      const syncResult = await syncInterviewMeeting({
        action: "upsert",
        applicationId: row.application_id ? Number(row.application_id) : undefined,
        title: `AI Interview – ${row.job_title}`,
        candidateName: row.candidate_name,
        candidateEmail: recipient,
        interviewDatetime: row.expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        internalAttendeeEmails: [],
        durationMinutes: Number(row.duration_minutes || 40),
        inviteSubject: subject,
        inviteBody: plainBody,
        inviteMode: "scheduled",
        skipConferencing: true,   // ← no Meet link
      });

      if (syncResult.status === "invite_sent" || syncResult.status === "meet_created") {
        deliveredVia = "google_calendar";
        deliveryMessageId = syncResult.external_calendar_event_id;
      } else if (syncResult.error) {
        lastErrorDetail = syncResult.error;
      }
    } catch (e) {
      console.warn("[ai-interviews] Google Calendar delivery failed, trying email fallback:", e);
      lastErrorDetail = e instanceof Error ? e.message : String(e);
    }
  }

  // 2. Fallback: transactional email (Resend / SMTP).
  if (!deliveredVia) {
    const emailTemplate = buildCandidateEmailTemplate({
      candidateName: row.candidate_name,
      paragraphs: [
        `You are invited to complete an AI-powered technical and behavioural interview for the position of <strong>${row.job_title}</strong>.`,
        `<strong>Interview duration:</strong> ${Number(row.duration_minutes)} minutes<br><strong>Interview window:</strong> ${windowLine}`,
        `Please complete the interview independently on a laptop or desktop with a working camera, microphone, and Chrome or Edge browser. Recording and browser integrity monitoring will begin after your consent.`,
        `Our recruiters will reach out to you based on the evaluation.`,
        `<em>This link is single-use — once you submit the interview it cannot be reopened.</em>`,
      ],
      cta: {
        label: "Start AI Interview →",
        url: publicUrl,
      },
      job: {
        title: row.job_title,
        company: row.job_company || "AASTHIX",
        location: row.job_location,
      },
    });

    const email = await sendTransactionalEmail({
      to: [recipient],
      subject,
      text: emailTemplate.text,
      html: emailTemplate.html,
    });

    if (email.sent) {
      deliveredVia = email.provider;
      deliveryMessageId = email.messageId || null;
    } else {
      lastErrorDetail = email.detail || lastErrorDetail || "Failed to deliver email invitation";
    }
  }

  if (!deliveredVia) {
    await query(
      `INSERT INTO ai_interview_audit_events (interview_id, actor_user_id, event_type, metadata_json)
       VALUES ($1, $2, 'INVITATION_SEND_FAILED', $3::jsonb)`,
      [interviewId, actorUserId, JSON.stringify({ recipient, detail: lastErrorDetail || null })]
    );
    return {
      ok: false,
      status: 503,
      error: "Invitation email could not be sent. The shared Google Calendar account must be connected in Settings, or configure Resend / SMTP in Railway environment variables.",
      detail: lastErrorDetail,
      recipient,
    };
  }

  await query(
    `UPDATE ai_interviews
        SET status = 'READY', secure_token_hash = $2, token_revoked_at = NULL, invitation_sent_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [interviewId, hashInterviewToken(token)]
  );

  await query(
    `INSERT INTO ai_interview_audit_events (interview_id, actor_user_id, event_type, metadata_json)
     VALUES ($1, $2, 'INVITATION_SENT', $3::jsonb)`,
    [interviewId, actorUserId, JSON.stringify({ recipient, provider: deliveredVia, message_id: deliveryMessageId, expires_at: row.expires_at })]
  );

  return {
    ok: true,
    sent: true,
    public_url: publicUrl,
    recipient,
    expires_at: row.expires_at,
    provider: deliveredVia,
    message_id: deliveryMessageId,
  };
}
