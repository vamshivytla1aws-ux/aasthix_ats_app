import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashExternalInviteToken } from "@/lib/chat/externalInvite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadInviteByToken(token: string) {
  const tokenHash = hashExternalInviteToken(token);
  const res = await query(
    `SELECT id, conversation_id, external_name, expires_at, revoked_at, created_by
     FROM chat_external_invites
     WHERE token_hash = $1
     LIMIT 1`,
    [tokenHash],
  );
  return res.rows[0] as
    | { id: number; conversation_id: number; external_name: string; expires_at: string; revoked_at: string | null; created_by: number }
    | undefined;
}

function inviteError(invite?: { expires_at: string; revoked_at: string | null }) {
  if (!invite) return "Invite not found.";
  if (invite.revoked_at) return "Invite access has been removed.";
  if (new Date(invite.expires_at).getTime() < Date.now()) return "Invite has expired.";
  return null;
}

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const token = String(params.token || "").trim();
  if (!token) return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  const invite = await loadInviteByToken(token);
  const err = inviteError(invite);
  if (err) return NextResponse.json({ error: err }, { status: 403 });

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 60;
  const rows = await query(
    `
    SELECT m.id, m.content, m.created_at, m.is_system, m.sender_id, u.full_name AS sender_name,
           m.attachment_type, m.attachment_url, m.attachment_name, m.attachment_size
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = $1
    ORDER BY m.created_at DESC
    LIMIT $2
    `,
    [invite!.conversation_id, limit],
  );
  return NextResponse.json({ messages: rows.rows.reverse(), external_name: invite!.external_name });
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const token = String(params.token || "").trim();
  if (!token) return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  const invite = await loadInviteByToken(token);
  const err = inviteError(invite);
  if (err) return NextResponse.json({ error: err }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const content = String(body?.content || "").trim();
  if (!content) return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  if (content.length > 1500) return NextResponse.json({ error: "Message too long." }, { status: 400 });

  await query(
    `INSERT INTO messages (conversation_id, sender_id, content, is_system)
     VALUES ($1, $2, $3, TRUE)`,
    [invite!.conversation_id, invite!.created_by, `External • ${invite!.external_name}: ${content}`],
  );
  await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [invite!.conversation_id]);
  return NextResponse.json({ operation_status: "success" }, { status: 201 });
}

