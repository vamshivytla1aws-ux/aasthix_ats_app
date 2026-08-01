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
  if (!row.email) return NextResponse.json({ error: "Candidate email is missing" }, { status: 400 });
  if (["COMPLETED","CANCELLED","EXPIRED"].includes(row.status) || new Date(row.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "This interview can no longer be sent" }, { status: 409 });
  }
  const token = createSecureInterviewToken();
  const publicUrl = buildPublicUrl(`/ai-interview/${token}`);
  await query(`UPDATE ai_interviews SET status='READY',secure_token_hash=$2,token_revoked_at=NULL,updated_at=NOW() WHERE id=$1`, [id,hashInterviewToken(token)]);
  const subject = `AI Interview Invitation - ${row.job_title}`;
  const text = `Dear ${row.full_name},\n\nYou are invited to complete an AI interview for ${row.job_title}.\nDuration: ${row.duration_minutes} minutes\nComplete by: ${formatIst(row.expires_at)} IST\n\nUse Chrome or Edge on a laptop or desktop with a working camera and microphone. The interview may record audio/video and monitor browser integrity events after you provide consent.\n\nStart interview: ${publicUrl}\n\nThis private link is intended only for you.`;
  const email = await sendTransactionalEmail({
    to: [String(row.email)], subject, text,
    html: `<p>Dear ${escapeHtml(row.full_name)},</p><p>You are invited to complete an AI interview for <strong>${escapeHtml(row.job_title)}</strong>.</p><p>Duration: ${Number(row.duration_minutes)} minutes<br/>Complete by: ${escapeHtml(formatIst(row.expires_at))} IST</p><p>Use Chrome or Edge on a laptop or desktop with a working camera and microphone. Recording and browser integrity monitoring begin only after consent.</p><p><a href="${escapeHtml(publicUrl)}">Start secure AI interview</a></p><p>This private link is intended only for you.</p>`,
  });
  if (!email.sent) return NextResponse.json({ error: "Invitation email could not be sent", detail: email.detail, public_url: publicUrl }, { status: 503 });
  await query(`UPDATE ai_interviews SET invitation_sent_at=NOW(),updated_at=NOW() WHERE id=$1`, [id]);
  await query(`INSERT INTO ai_interview_audit_events (interview_id,actor_user_id,event_type) VALUES ($1,$2,'INVITATION_SENT')`, [id,auth.access.user_id]);
  return NextResponse.json({ sent: true, public_url: publicUrl });
}
