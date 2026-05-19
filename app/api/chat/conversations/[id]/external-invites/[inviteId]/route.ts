import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: { id: string; inviteId: string } }) {
  const gate = await requirePermission("chat.view");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const access = gate.access;
  const conversationId = Number(params.id);
  const inviteId = Number(params.inviteId);
  if (!Number.isFinite(conversationId) || !Number.isFinite(inviteId)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const member = await query(`SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, [conversationId, access.user_id]);
  if (!member.rowCount) return NextResponse.json({ error: "Not authorized for this conversation." }, { status: 403 });

  await query(
    `UPDATE chat_external_invites
     SET revoked_at = NOW(), revoked_by = $3
     WHERE id = $1 AND conversation_id = $2`,
    [inviteId, conversationId, access.user_id],
  );

  return NextResponse.json({ operation_status: "success", user_message: "External access removed." });
}

