import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncomingMention = { type: "user" | "candidate"; id: number; label: string };

export async function POST(
  request: Request,
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

    const memberCheck = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, access.user_id]
    );
    if (!memberCheck.rowCount) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const parentCheck = await query(
      `SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2`,
      [messageId, conversationId]
    );
    if (!parentCheck.rowCount) {
      return NextResponse.json({ error: "Parent message not found" }, { status: 404 });
    }

    const body = await request.json();
    const content = (body.content || "").trim();
    const attachmentType = body.attachment_type || null;
    const attachmentUrl = body.attachment_url || null;
    const attachmentName = body.attachment_name || null;
    const attachmentSize = body.attachment_size || null;
    const mentionsRaw = Array.isArray(body.mentions) ? body.mentions : [];

    if (!content && !attachmentUrl) {
      return NextResponse.json({ error: "Content or attachment required" }, { status: 400 });
    }
    if (content.length > 4000) {
      return NextResponse.json({ error: "Message too long (max 4000 chars)" }, { status: 400 });
    }

    const mentions = mentionsRaw
      .map((item: unknown) => {
        if (!item || typeof item !== "object") return null;
        const obj = item as Record<string, unknown>;
        const type = String(obj.type || "").toLowerCase();
        const id = Number(obj.id);
        const label = String(obj.label || "").trim();
        if (!["user", "candidate"].includes(type)) return null;
        if (!Number.isFinite(id) || id <= 0 || !label) return null;
        return { type, id, label: label.slice(0, 120) };
      })
      .filter((item: IncomingMention | null): item is IncomingMention => !!item);

    const msgRes = await query(
      `INSERT INTO messages (
         conversation_id,
         sender_id,
         content,
         attachment_type,
         attachment_url,
         attachment_name,
         attachment_size,
         parent_message_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, conversation_id, sender_id, content, is_system, created_at,
                 attachment_type, attachment_url, attachment_name, attachment_size, parent_message_id`,
      [
        conversationId,
        access.user_id,
        content || "",
        attachmentType,
        attachmentUrl,
        attachmentName,
        attachmentSize,
        messageId,
      ]
    );

    const createdMessageId = (msgRes.rows[0] as { id: number }).id;
    if (mentions.length > 0) {
      for (const mention of mentions) {
        await query(
          `INSERT INTO message_mentions (message_id, entity_type, entity_id, label)
           VALUES ($1, $2, $3, $4)`,
          [createdMessageId, mention.type, mention.id, mention.label]
        );
      }
    }

    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
    await query(
      `UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, access.user_id]
    );

    const userRes = await query(`SELECT full_name, email FROM users WHERE id = $1`, [access.user_id]);
    const user = userRes.rows[0] as { full_name: string; email: string };
    return NextResponse.json(
      { message: { ...(msgRes.rows[0] as Record<string, unknown>), mentions, sender_name: user.full_name, sender_email: user.email } },
      { status: 201 }
    );
  } catch (error) {
    console.error("chat/thread message POST", error);
    return NextResponse.json({ error: "Failed to send thread reply" }, { status: 500 });
  }
}
