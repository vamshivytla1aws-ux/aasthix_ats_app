import { query } from "@/lib/db";
import { createSecureInterviewToken, hashInterviewToken } from "@/lib/aiInterviews/token";
import { buildPublicUrl } from "@/lib/publicUrl";
import { sendTransactionalEmail } from "@/lib/sendTransactionalEmail";
import { buildCandidateEmailTemplate } from "@/lib/candidateEmailTemplate";

function formatIst(value: string | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeStyle: "short",
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
  const expiry = `${formatIst(row.expires_at)} IST`;
  const subject = `AI Interview Invitation: ${row.job_title} at ${row.job_company || "AASTHIX"}`;

  // Send a plain transactional email — no Google Calendar event, no Meet link.
  const emailTemplate = buildCandidateEmailTemplate({
    candidateName: row.candidate_name,
    paragraphs: [
      `You are invited to complete an AI-powered technical and behavioural interview for the position of <strong>${row.job_title}</strong> at ${row.job_company || "AASTHIX"}.`,
      `<strong>Interview duration:</strong> ${Number(row.duration_minutes)} minutes<br><strong>Link expires:</strong> ${expiry}`,
      `Please complete the interview independently on a laptop or desktop with a working camera, microphone, and Chrome or Edge browser. Recording and browser integrity monitoring will begin after your consent.`,
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

  if (!email.sent) {
    const detail = email.detail || "Failed to deliver email invitation";
    await query(
      `INSERT INTO ai_interview_audit_events (interview_id, actor_user_id, event_type, metadata_json)
       VALUES ($1, $2, 'INVITATION_SEND_FAILED', $3::jsonb)`,
      [interviewId, actorUserId, JSON.stringify({ recipient, detail })]
    );
    return {
      ok: false,
      status: 503,
      error: "Invitation email could not be sent. Please verify your Resend sender domain or configure SMTP in Railway environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM).",
      detail,
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
    [interviewId, actorUserId, JSON.stringify({ recipient, provider: email.provider, message_id: email.messageId || null, expires_at: row.expires_at })]
  );

  return {
    ok: true,
    sent: true,
    public_url: publicUrl,
    recipient,
    expires_at: row.expires_at,
    provider: email.provider,
    message_id: email.messageId || null,
  };
}
