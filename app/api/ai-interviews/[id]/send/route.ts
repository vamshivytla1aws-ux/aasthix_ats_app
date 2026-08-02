import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { canAccessAiInterview } from "@/lib/aiInterviews/access";
import { createSecureInterviewToken, hashInterviewToken } from "@/lib/aiInterviews/token";
import { buildPublicUrl } from "@/lib/publicUrl";
import { sendTransactionalEmail } from "@/lib/sendTransactionalEmail";

export const runtime = "nodejs";

function formatIst(value: string | Date) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await requirePermission("ai_interviews.create");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await canAccessAiInterview(auth.access, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await query(
    `SELECT ai.id,ai.title,ai.duration_minutes,ai.expires_at,ai.status,c.full_name,c.email,j.title AS job_title
       FROM ai_interviews ai JOIN candidates c ON c.id=ai.candidate_id JOIN jobs j ON j.id=ai.job_id WHERE ai.id=$1`, [id]
  );
  if (!result.rowCount) return NextResponse.json({ error: "AI interview not found" }, { status: 404 });
  const row = result.rows[0];
  const recipient = String(row.email || "").trim().toLowerCase();
  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return NextResponse.json({ error: "Candidate email is missing or invalid" }, { status: 400 });
  if (["COMPLETED","CANCELLED","EXPIRED"].includes(row.status) || new Date(row.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This interview can no longer be sent" }, { status: 409 });
  }
  const token = createSecureInterviewToken();
  const publicUrl = buildPublicUrl(`/ai-interview/${token}`);
  const expiry = `${formatIst(row.expires_at)} IST`;
  const subject = `Complete your AASTHIX AI Interview - ${row.job_title}`;
  const text = `Dear ${row.full_name},\n\nYou are invited to complete an AASTHIX AI Interview for ${row.job_title}.\n\nInterview duration: ${row.duration_minutes} minutes\nLink expires: ${expiry}\n\nPlease complete the interview independently and answer genuinely based on your own knowledge and experience. Do not share this private link, use impersonation, or rely on unauthorized external assistance.\n\nUse Chrome or Edge on a laptop or desktop with a working camera, microphone, and stable internet connection. Recording and browser integrity monitoring begin only after you review and provide consent.\n\nStart your secure AI Interview: ${publicUrl}\n\nPlease complete the interview before the expiry shown above. After expiry, this link will no longer work.\n\nRegards,\nAASTHIX Talent Team`;
  const email = await sendTransactionalEmail({
    to: [recipient], subject, text,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:640px"><h2 style="color:#153e75">AASTHIX AI Interview</h2><p>Dear ${escapeHtml(row.full_name)},</p><p>You are invited to complete an AI Interview for <strong>${escapeHtml(row.job_title)}</strong>.</p><div style="background:#f3f7fd;border:1px solid #d7e3f4;border-radius:10px;padding:14px 16px"><strong>Interview duration:</strong> ${Number(row.duration_minutes)} minutes<br/><strong>Link expires:</strong> ${escapeHtml(expiry)}</div><p>Please complete the interview independently and answer genuinely based on your own knowledge and experience. Do not share this private link, use impersonation, or rely on unauthorized external assistance.</p><p>Use Chrome or Edge on a laptop or desktop with a working camera, microphone, and stable internet connection. Recording and browser integrity monitoring begin only after you review and provide consent.</p><p style="margin:24px 0"><a href="${escapeHtml(publicUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700">Start AI Interview</a></p><p style="font-size:13px;color:#52627a">If the button does not work, open this link:<br/><a href="${escapeHtml(publicUrl)}">${escapeHtml(publicUrl)}</a></p><p>Please complete the interview before the expiry shown above. After expiry, this link will no longer work.</p><p>Regards,<br/>AASTHIX Talent Team</p></div>`,
  });
  if (!email.sent) {
    await query(`INSERT INTO ai_interview_audit_events (interview_id,actor_user_id,event_type,metadata_json) VALUES ($1,$2,'INVITATION_SEND_FAILED',$3::jsonb)`, [id,auth.access.user_id,JSON.stringify({ recipient, reason: email.reason, detail: email.detail || null })]);
    return NextResponse.json({ error: "Invitation email could not be sent. The existing candidate link remains active.", detail: email.detail, recipient }, { status: 503 });
  }
  await query(`UPDATE ai_interviews SET status='READY',secure_token_hash=$2,token_revoked_at=NULL,invitation_sent_at=NOW(),updated_at=NOW() WHERE id=$1`, [id,hashInterviewToken(token)]);
  await query(`INSERT INTO ai_interview_audit_events (interview_id,actor_user_id,event_type,metadata_json) VALUES ($1,$2,'INVITATION_SENT',$3::jsonb)`, [id,auth.access.user_id,JSON.stringify({ recipient, provider: email.provider, message_id: email.messageId || null, expires_at: row.expires_at })]);
  return NextResponse.json({ sent: true, public_url: publicUrl, recipient, expires_at: row.expires_at, provider: email.provider, message_id: email.messageId || null });
}
