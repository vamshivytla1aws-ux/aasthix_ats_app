import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireWorkspaceOwner } from "@/lib/rbac";
import { generateInviteToken, hashInviteToken } from "@/lib/inviteToken";
import { writeAuditLog } from "@/lib/auditLog";
import { INVITE_ROLES } from "@/lib/rbacConstants";
import { buildPublicUrl } from "@/lib/publicUrl";
import { sendTransactionalEmail } from "@/lib/sendTransactionalEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  try {
    const auth = await requireWorkspaceOwner();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const res = await query(
      `SELECT id, email, role, access_scope, expires_at, created_at, accepted_at,
              sent_at, send_provider, message_id, delivery_error, revoked_at, updated_at
       FROM user_invites
       ORDER BY created_at DESC
       LIMIT 100`
    );
    return NextResponse.json({ invites: res.rows });
  } catch (e) {
    console.error("admin invites GET", e);
    return NextResponse.json({ error: "Failed to list invites" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireWorkspaceOwner();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { email, role, access_scope } = body as { email?: string; role?: string; access_scope?: string };

    if (!email?.trim()) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    const r = (role || "user").toLowerCase();
    const scope = String(access_scope || "own").toLowerCase();
    if (!new Set(["own", "team", "all"]).has(scope)) {
      return NextResponse.json({ error: "access_scope must be own, team, or all" }, { status: 400 });
    }
    if (!(INVITE_ROLES as readonly string[]).includes(r)) {
      return NextResponse.json(
        { error: `role must be one of: ${INVITE_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    const emailNorm = email.trim().toLowerCase();
    const existing = await query(`SELECT 1 FROM users WHERE email = $1`, [emailNorm]);
    if (existing.rowCount && existing.rowCount > 0) {
      return NextResponse.json({ error: "User with this email already exists" }, { status: 409 });
    }

    const raw = generateInviteToken();
    const tokenHash = hashInviteToken(raw);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await query(`DELETE FROM user_invites WHERE lower(email) = lower($1) AND accepted_at IS NULL`, [
      emailNorm,
    ]);

    await query(
      `INSERT INTO user_invites (email, token_hash, role, access_scope, expires_at, created_by_user_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [emailNorm, tokenHash, r, scope, expiresAt, auth.access.user_id]
    );

    const inviteUrl = buildPublicUrl(`/invite/accept?token=${encodeURIComponent(raw)}`);

    const delivery = await sendInviteEmail(emailNorm, r, scope, inviteUrl, expiresAt);
    await query(
      `UPDATE user_invites SET sent_at = CASE WHEN $2 THEN NOW() ELSE sent_at END,
              send_provider = $3, message_id = $4, delivery_error = $5, updated_at = NOW()
       WHERE token_hash = $1`,
      [tokenHash, delivery.sent, delivery.sent ? delivery.provider : null, delivery.sent ? delivery.messageId || null : null, delivery.sent ? null : delivery.detail || delivery.reason]
    );

    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "auth.invite.created",
      metadata: { email: emailNorm, role: r, access_scope: scope, delivery_sent: delivery.sent },
    });

    if (process.env.NODE_ENV === "development") {
      console.log("[invite]", inviteUrl);
    }

    return NextResponse.json({ inviteUrl, expiresAt: expiresAt.toISOString(), delivery }, { status: 201 });
  } catch (e) {
    console.error("admin invites POST", e);
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}

async function sendInviteEmail(email: string, role: string, scope: string, inviteUrl: string, expiresAt: Date) {
  const expires = expiresAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const text = `You have been invited to AASTHIX ATS.\n\nRole: ${role.replace(/_/g, " ")}\nData access: ${scope}\nInvite expires: ${expires} IST\n\nVerify your email and set your password:\n${inviteUrl}\n\nIf you were not expecting this invitation, you can ignore this email.`;
  return sendTransactionalEmail({
    to: [email],
    subject: "Your AASTHIX ATS workspace invitation",
    text,
    html: `<p>You have been invited to <strong>AASTHIX ATS</strong>.</p><p><strong>Role:</strong> ${role.replace(/_/g, " ")}<br/><strong>Data access:</strong> ${scope}<br/><strong>Expires:</strong> ${expires} IST</p><p><a href="${inviteUrl}">Verify email and set password</a></p><p>If you were not expecting this invitation, you can ignore this email.</p>`,
  });
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireWorkspaceOwner();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json() as { id?: number; action?: "resend" | "revoke" | "extend"; days?: number };
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Valid invite id is required" }, { status: 400 });
    const current = await query(`SELECT id, email, role, access_scope, accepted_at FROM user_invites WHERE id = $1`, [id]);
    if (!current.rowCount) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    if (current.rows[0].accepted_at) return NextResponse.json({ error: "Accepted invites cannot be changed" }, { status: 409 });
    if (body.action === "revoke") {
      await query(`UPDATE user_invites SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
      await writeAuditLog({ actorUserId: auth.access.user_id, action: "auth.invite.revoked", metadata: { invite_id: id } });
      return NextResponse.json({ ok: true });
    }
    const days = Math.min(14, Math.max(1, Number(body.days || 1)));
    if (body.action === "extend") {
      const extended = await query(`UPDATE user_invites SET expires_at = GREATEST(expires_at, NOW()) + ($2 * INTERVAL '1 day'), revoked_at = NULL, updated_at = NOW() WHERE id = $1 RETURNING expires_at`, [id, days]);
      await writeAuditLog({ actorUserId: auth.access.user_id, action: "auth.invite.extended", metadata: { invite_id: id, days } });
      return NextResponse.json({ ok: true, expiresAt: extended.rows[0].expires_at });
    }
    if (body.action !== "resend") return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    const raw = generateInviteToken();
    const tokenHash = hashInviteToken(raw);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const row = current.rows[0] as { email: string; role: string; access_scope: string };
    const inviteUrl = buildPublicUrl(`/invite/accept?token=${encodeURIComponent(raw)}`);
    const delivery = await sendInviteEmail(row.email, row.role, row.access_scope, inviteUrl, expiresAt);
    await query(`UPDATE user_invites SET token_hash=$2, expires_at=$3, revoked_at=NULL, sent_at=CASE WHEN $4 THEN NOW() ELSE sent_at END, send_provider=$5, message_id=$6, delivery_error=$7, updated_at=NOW() WHERE id=$1`, [id, tokenHash, expiresAt, delivery.sent, delivery.sent ? delivery.provider : null, delivery.sent ? delivery.messageId || null : null, delivery.sent ? null : delivery.detail || delivery.reason]);
    await writeAuditLog({ actorUserId: auth.access.user_id, action: "auth.invite.resent", metadata: { invite_id: id, delivery_sent: delivery.sent } });
    return NextResponse.json({ ok: delivery.sent, inviteUrl, expiresAt: expiresAt.toISOString(), delivery }, { status: delivery.sent ? 200 : 502 });
  } catch (error) {
    console.error("admin invites PATCH", error);
    return NextResponse.json({ error: "Failed to update invite" }, { status: 500 });
  }
}
