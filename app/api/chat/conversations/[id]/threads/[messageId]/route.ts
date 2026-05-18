import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { mentionAggregateSql, reactionAggregateSql } from "@/lib/chat/v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireConversationMember(conversationId: number, userId: number) {
  const memberCheck = await query(
    `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  return !!memberCheck.rowCount;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string; messageId: string } }
) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const conversationId = Number(params.id);
    const messageId = Number(params.messageId);
    if (!Number.isFinite(conversationId) || !Number.isFinite(messageId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    if (!(await requireConversationMember(conversationId, access.user_id))) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const parentRes = await query(
      `SELECT
         m.id,
         m.conversation_id,
         m.sender_id,
         m.content,
         m.is_system,
         m.created_at,
         m.attachment_type,
         m.attachment_url,
         m.attachment_name,
         m.attachment_size,
         m.parent_message_id,
         m.delivery_state,
         m.edited_at,
         m.edited_by,
         m.deleted_at,
         m.deleted_by,
         ${mentionAggregateSql},
         ${reactionAggregateSql},
         u.full_name AS sender_name,
         u.email AS sender_email
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.id = $1 AND m.conversation_id = $2`,
      [messageId, conversationId]
    );
    if (!parentRes.rowCount) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const repliesRes = await query(
      `SELECT
         m.id,
         m.conversation_id,
         m.sender_id,
         m.content,
         m.is_system,
         m.created_at,
         m.attachment_type,
         m.attachment_url,
         m.attachment_name,
         m.attachment_size,
         m.parent_message_id,
         m.delivery_state,
         m.edited_at,
         m.edited_by,
         m.deleted_at,
         m.deleted_by,
         ${mentionAggregateSql},
         ${reactionAggregateSql},
         u.full_name AS sender_name,
         u.email AS sender_email
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.parent_message_id = $1 AND m.conversation_id = $2
       ORDER BY m.created_at ASC`,
      [messageId, conversationId]
    );

    return NextResponse.json({ parent_message: parentRes.rows[0], replies: repliesRes.rows });
  } catch (error) {
    console.error("chat/thread GET", error);
    return NextResponse.json({ error: "Failed to load thread" }, { status: 500 });
  }
}
