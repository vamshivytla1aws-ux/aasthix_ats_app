import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { generateExternalInviteToken, hashExternalInviteToken } from "@/lib/chat/externalInvite";
import { sendTransactionalEmail } from "@/lib/sendTransactionalEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveInviteOrigin(request: Request) {
  const configured = String(process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fallback to request origin below
    }
  }
  return new URL(request.url).origin;
}

async function assertMember(conversationId: number, userId: number) {
  const r = await query(`SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, [conversationId, userId]);
  return r.rowCount > 0;
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission("chat.view");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const access = gate.access;
  const conversationId = Number(params.id);
  if (!Number.isFinite(conversationId)) return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
  if (!(await assertMember(conversationId, access.user_id))) {
    return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });
  }

  const res = await query(
    `SELECT id, external_name, expires_at, revoked_at, created_at
     FROM chat_external_invites
     WHERE conversation_id = $1
     ORDER BY created_at DESC`,
    [conversationId],
  );
  return NextResponse.json({ invites: res.rows });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
    if (!(await assertMember(conversationId, access.user_id))) {
      return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const externalName = String(body?.external_name || "").trim();
    if (!externalName) return NextResponse.json({ error: "External name is required." }, { status: 400 });
    const externalEmail = String(body?.external_email || "").trim().toLowerCase();
    if (!externalEmail) return NextResponse.json({ error: "External email is required." }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(externalEmail)) {
      return NextResponse.json({ error: "Please enter a valid external email." }, { status: 400 });
    }
    const expiryHoursRaw = Number(body?.expiry_hours);
    const expiryHours = Number.isFinite(expiryHoursRaw) && expiryHoursRaw >= 1 && expiryHoursRaw <= 168 ? Math.trunc(expiryHoursRaw) : 24;
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

    const token = generateExternalInviteToken();
    const tokenHash = hashExternalInviteToken(token);
    const inserted = await query(
      `INSERT INTO chat_external_invites (conversation_id, created_by, external_name, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz)
       RETURNING id, external_name, expires_at, created_at`,
      [conversationId, access.user_id, externalName, tokenHash, expiresAt],
    );

    const host = resolveInviteOrigin(request);
    const inviteLink = `${host}/chat/external/${token}`;
    const convRes = await query(`SELECT name FROM conversations WHERE id = $1`, [conversationId]);
    const conversationName = String(convRes.rows?.[0]?.name || "Temporary chat");
    const inviterRes = await query(`SELECT full_name, email FROM users WHERE id = $1`, [access.user_id]);
    const inviterName = String(inviterRes.rows?.[0]?.full_name || "Aasthix user");
    const inviterEmail = String(inviterRes.rows?.[0]?.email || "");

    const subject = `Temporary chat invite: ${conversationName}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
        <p>Hi ${externalName},</p>
        <p>${inviterName}${inviterEmail ? ` (${inviterEmail})` : ""} invited you to a temporary chat on Aasthix Chat.</p>
        <p><b>Conversation:</b> ${conversationName}</p>
        <p><b>Expires:</b> ${new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
        <p><a href="${inviteLink}" style="display:inline-block;padding:10px 14px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:8px">Open temporary chat</a></p>
        <p>If the button doesn't work, use this link:<br/><a href="${inviteLink}">${inviteLink}</a></p>
      </div>
    `;
    const text = `Hi ${externalName},\n\n${inviterName}${inviterEmail ? ` (${inviterEmail})` : ""} invited you to a temporary chat on Aasthix Chat.\nConversation: ${conversationName}\nExpires: ${new Date(expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}\n\nOpen link: ${inviteLink}`;
    const mail = await sendTransactionalEmail({
      to: [externalEmail],
      subject,
      text,
      html,
    });
    if (!mail.sent) {
      return NextResponse.json(
        {
          operation_status: "error",
          user_message: "Temporary link created but email could not be sent.",
          hint: mail.detail || "Check SMTP configuration.",
          invite: inserted.rows[0],
          invite_link: inviteLink,
          email_send_status: "failed",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      operation_status: "success",
      user_message: "Temporary external chat invite sent.",
      invite: inserted.rows[0],
      invite_link: inviteLink,
      email_send_status: "sent",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create external invite." }, { status: 400 });
  }
}
