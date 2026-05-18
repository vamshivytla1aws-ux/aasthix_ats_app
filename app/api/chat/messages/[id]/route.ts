import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/auditLog";
import { requireConversationMember } from "@/lib/chat/v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getMessageMeta(messageId: number) {
  const res = await query(
    `SELECT id, conversation_id, sender_id, deleted_at FROM messages WHERE id = $1 LIMIT 1`,
    [messageId]
  );
  return (res.rows[0] as { id: number; conversation_id: number; sender_id: number; deleted_at: string | null } | undefined) ?? null;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const messageId = Number(params.id);
    if (!Number.isFinite(messageId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const meta = await getMessageMeta(messageId);
    if (!meta) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    if (!(await requireConversationMember(meta.conversation_id, access.user_id))) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    if (meta.sender_id !== access.user_id && access.role !== "admin") {
      return NextResponse.json({ error: "Only sender or admin can edit message" }, { status: 403 });
    }

    const body = await request.json();
    const content = String(body?.content || "").trim();
    if (!content) return NextResponse.json({ error: "content required" }, { status: 400 });
    if (content.length > 4000) return NextResponse.json({ error: "Message too long (max 4000 chars)" }, { status: 400 });

    const upd = await query(
      `UPDATE messages
       SET content = $1, edited_at = NOW(), edited_by = $2
       WHERE id = $3
       RETURNING id, conversation_id, sender_id, content, is_system, created_at,
                 attachment_type, attachment_url, attachment_name, attachment_size,
                 parent_message_id, delivery_state, edited_at, edited_by, deleted_at, deleted_by`,
      [content, access.user_id, messageId]
    );

    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [meta.conversation_id]);
    await writeAuditLog({
      actorUserId: access.user_id,
      action: "chat.message.updated",
      metadata: { message_id: messageId, conversation_id: meta.conversation_id },
    });

    return NextResponse.json({
      operation_status: "success",
      user_message: "Message updated.",
      message: upd.rows[0],
    });
  } catch (error) {
    console.error("chat/message PATCH", error);
    return NextResponse.json({ error: "Failed to update message" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const messageId = Number(params.id);
    if (!Number.isFinite(messageId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const meta = await getMessageMeta(messageId);
    if (!meta) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    if (!(await requireConversationMember(meta.conversation_id, access.user_id))) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    if (meta.sender_id !== access.user_id && access.role !== "admin") {
      return NextResponse.json({ error: "Only sender or admin can delete message" }, { status: 403 });
    }

    await query(
      `UPDATE messages
       SET deleted_at = NOW(), deleted_by = $1, content = ''
       WHERE id = $2`,
      [access.user_id, messageId]
    );
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [meta.conversation_id]);
    await writeAuditLog({
      actorUserId: access.user_id,
      action: "chat.message.deleted",
      metadata: { message_id: messageId, conversation_id: meta.conversation_id },
    });

    return NextResponse.json({
      operation_status: "success",
      user_message: "Message deleted.",
    });
  } catch (error) {
    console.error("chat/message DELETE", error);
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}

