import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { generateExternalInviteToken, hashExternalInviteToken } from "@/lib/chat/externalInvite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const host = new URL(request.url).origin;
    const inviteLink = `${host}/chat/external/${token}`;

    return NextResponse.json({
      operation_status: "success",
      user_message: "Temporary external chat link created.",
      invite: inserted.rows[0],
      invite_link: inviteLink,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create external invite." }, { status: 400 });
  }
}

