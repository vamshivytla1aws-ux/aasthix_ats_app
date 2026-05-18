import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { mentionAggregateSql, reactionAggregateSql, requireConversationMember } from "@/lib/chat/v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    if (!(await requireConversationMember(conversationId, access.user_id))) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const res = await query(
      `SELECT
         cp.id AS pin_id,
         cp.created_at AS pinned_at,
         cp.pinned_by,
         pu.full_name AS pinned_by_name,
         m.id,
         m.conversation_id,
         m.sender_id,
         CASE
           WHEN m.deleted_at IS NOT NULL THEN '[message deleted]'
           ELSE m.content
         END AS content,
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
       FROM conversation_pins cp
       JOIN messages m ON m.id = cp.message_id
       JOIN users u ON u.id = m.sender_id
       JOIN users pu ON pu.id = cp.pinned_by
       WHERE cp.conversation_id = $1
       ORDER BY cp.created_at DESC`,
      [conversationId]
    );

    return NextResponse.json({ pins: res.rows });
  } catch (error) {
    console.error("chat/pins GET", error);
    return NextResponse.json({ error: "Failed to load pins" }, { status: 500 });
  }
}

