import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashExternalInviteToken } from "@/lib/chat/externalInvite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const token = String(params.token || "").trim();
  if (!token) return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  const tokenHash = hashExternalInviteToken(token);
  const res = await query(
    `
    SELECT i.id, i.external_name, i.expires_at, i.revoked_at, i.conversation_id, c.name AS conversation_name
    FROM chat_external_invites i
    JOIN conversations c ON c.id = i.conversation_id
    WHERE i.token_hash = $1
    LIMIT 1
    `,
    [tokenHash],
  );
  const invite = res.rows[0] as
    | { id: number; external_name: string; expires_at: string; revoked_at: string | null; conversation_id: number; conversation_name: string | null }
    | undefined;
  if (!invite) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  if (invite.revoked_at) return NextResponse.json({ error: "Invite access has been removed." }, { status: 403 });
  if (new Date(invite.expires_at).getTime() < Date.now()) return NextResponse.json({ error: "Invite has expired." }, { status: 403 });

  return NextResponse.json({
    invite: {
      id: invite.id,
      external_name: invite.external_name,
      conversation_id: invite.conversation_id,
      conversation_name: invite.conversation_name,
      expires_at: invite.expires_at,
    },
  });
}

