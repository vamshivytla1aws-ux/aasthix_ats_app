import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { reactionAggregateSql } from "@/lib/chat/v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/chat/conversations/[id]/messages
 * Paginated message history for a conversation.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const convId = Number(params.id);
    if (!Number.isFinite(convId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const memberCheck = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [convId, access.user_id]
    );
    if (!memberCheck.rowCount) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 100);
    const before = searchParams.get("before");
    const search = searchParams.get("search")?.trim() || "";
    const parentMessageIdParam = searchParams.get("parent_message_id");
    const parentMessageId = parentMessageIdParam == null ? null : Number(parentMessageIdParam);

    const qParams: (string | number)[] = [convId];
    let whereExtra = "";
    if (parentMessageIdParam != null) {
      if (!Number.isFinite(parentMessageId)) {
        return NextResponse.json({ error: "Invalid parent_message_id" }, { status: 400 });
      }
      qParams.push(parentMessageId as number);
      whereExtra += ` AND m.parent_message_id = $${qParams.length}`;
    } else {
      whereExtra += ` AND m.parent_message_id IS NULL`;
    }

    if (before && Number.isFinite(Number(before))) {
      qParams.push(Number(before));
      whereExtra += ` AND m.id < $${qParams.length}`;
    }

    if (search) {
      qParams.push(`%${search}%`);
      whereExtra += ` AND m.content ILIKE $${qParams.length}`;
    }

    qParams.push(limit);

    const res = await query(
      `SELECT
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
         (
           SELECT COUNT(*)::int
           FROM messages mr
           WHERE mr.parent_message_id = m.id
         ) AS thread_reply_count,
         (
           SELECT MAX(mr.created_at)
           FROM messages mr
           WHERE mr.parent_message_id = m.id
         ) AS thread_last_reply_at,
         ${reactionAggregateSql},
         u.full_name AS sender_name,
         u.email AS sender_email
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = $1 ${whereExtra}
       ORDER BY m.created_at DESC
       LIMIT $${qParams.length}`,
      qParams
    );

    const messages = (res.rows as Array<Record<string, unknown>>).reverse();
    const hasMore = messages.length === limit;

    return NextResponse.json({ messages, has_more: hasMore });
  } catch (error) {
    console.error("chat/messages GET", error);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

/**
 * POST /api/chat/conversations/[id]/messages
 * Send a message. Body: { content, attachment_type?, attachment_url?, attachment_name?, attachment_size? }
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const convId = Number(params.id);
    if (!Number.isFinite(convId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const memberCheck = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [convId, access.user_id]
    );
    if (!memberCheck.rowCount) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const body = await request.json();
    const content = (body.content || "").trim();
    const attachmentType = body.attachment_type || null;
    const attachmentUrl = body.attachment_url || null;
    const attachmentName = body.attachment_name || null;
    const attachmentSize = body.attachment_size || null;
    const idempotencyKeyRaw = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
    const idempotencyKey = idempotencyKeyRaw || null;
    const parentMessageIdRaw = body.parent_message_id;
    const parentMessageId =
      parentMessageIdRaw == null || parentMessageIdRaw === ""
        ? null
        : Number(parentMessageIdRaw);

    if (!content && !attachmentUrl) {
      return NextResponse.json({ error: "Content or attachment required" }, { status: 400 });
    }
    if (content.length > 4000) {
      return NextResponse.json({ error: "Message too long (max 4000 chars)" }, { status: 400 });
    }
    if (parentMessageIdRaw != null && !Number.isFinite(parentMessageId)) {
      return NextResponse.json({ error: "Invalid parent_message_id" }, { status: 400 });
    }

    if (parentMessageId != null) {
      const parentCheck = await query(
        `SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2`,
        [parentMessageId, convId]
      );
      if (!parentCheck.rowCount) {
        return NextResponse.json({ error: "Parent message not found in conversation" }, { status: 400 });
      }
    }

    if (idempotencyKey) {
      const dup = await query(
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
           m.deleted_by
         FROM messages m
         WHERE m.conversation_id = $1 AND m.sender_id = $2 AND m.idempotency_key = $3
         LIMIT 1`,
        [convId, access.user_id, idempotencyKey]
      );
      if (dup.rowCount) {
        const userRes = await query(`SELECT full_name, email FROM users WHERE id = $1`, [access.user_id]);
        const user = userRes.rows[0] as { full_name: string; email: string };
        return NextResponse.json({
          message: { ...(dup.rows[0] as Record<string, unknown>), sender_name: user.full_name, sender_email: user.email },
        });
      }
    }

    const msgRes = await query(
      `INSERT INTO messages (conversation_id, sender_id, content, attachment_type, attachment_url, attachment_name, attachment_size, parent_message_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, conversation_id, sender_id, content, is_system, created_at,
                 attachment_type, attachment_url, attachment_name, attachment_size, parent_message_id, delivery_state, edited_at, edited_by, deleted_at, deleted_by`,
      [
        convId,
        access.user_id,
        content || "",
        attachmentType,
        attachmentUrl,
        attachmentName,
        attachmentSize,
        parentMessageId,
      ]
    );

    if (idempotencyKey) {
      await query(`UPDATE messages SET idempotency_key = $1 WHERE id = $2`, [idempotencyKey, (msgRes.rows[0] as { id: number }).id]);
    }

    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [convId]);
    await query(
      `UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2`,
      [convId, access.user_id]
    );

    const msg = msgRes.rows[0] as Record<string, unknown>;

    const userRes = await query(`SELECT full_name, email FROM users WHERE id = $1`, [access.user_id]);
    const user = userRes.rows[0] as { full_name: string; email: string };

    return NextResponse.json({
      message: { ...msg, sender_name: user.full_name, sender_email: user.email },
    }, { status: 201 });
  } catch (error) {
    console.error("chat/messages POST", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
