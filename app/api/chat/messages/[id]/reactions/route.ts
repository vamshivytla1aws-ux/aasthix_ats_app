import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireConversationMember } from "@/lib/chat/v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getConversationId(messageId: number) {
  const res = await query(`SELECT conversation_id FROM messages WHERE id = $1`, [messageId]);
  return (res.rows[0] as { conversation_id: number } | undefined)?.conversation_id ?? null;
}

async function fetchReactionSummary(messageId: number) {
  const res = await query(
    `SELECT
       mr.emoji,
       COUNT(*)::int AS count,
       jsonb_agg(jsonb_build_object('user_id', u.id, 'full_name', u.full_name) ORDER BY u.full_name) AS users
     FROM message_reactions mr
     JOIN users u ON u.id = mr.user_id
     WHERE mr.message_id = $1
     GROUP BY mr.emoji
     ORDER BY mr.emoji`,
    [messageId]
  );
  return res.rows;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const messageId = Number(params.id);
    if (!Number.isFinite(messageId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const conversationId = await getConversationId(messageId);
    if (!conversationId) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    if (!(await requireConversationMember(conversationId, access.user_id))) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const body = await request.json();
    const emoji = String(body?.emoji || "").trim();
    if (!emoji) return NextResponse.json({ error: "emoji required" }, { status: 400 });

    await query(
      `INSERT INTO message_reactions (message_id, user_id, emoji)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
      [messageId, access.user_id, emoji]
    );
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);

    return NextResponse.json({
      operation_status: "success",
      user_message: "Reaction added.",
      reactions: await fetchReactionSummary(messageId),
    });
  } catch (error) {
    console.error("chat/reaction POST", error);
    return NextResponse.json({ error: "Failed to add reaction" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const messageId = Number(params.id);
    if (!Number.isFinite(messageId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const conversationId = await getConversationId(messageId);
    if (!conversationId) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    if (!(await requireConversationMember(conversationId, access.user_id))) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const emoji = String(searchParams.get("emoji") || "").trim();
    if (!emoji) return NextResponse.json({ error: "emoji query param required" }, { status: 400 });

    await query(
      `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, access.user_id, emoji]
    );
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);

    return NextResponse.json({
      operation_status: "success",
      user_message: "Reaction removed.",
      reactions: await fetchReactionSummary(messageId),
    });
  } catch (error) {
    console.error("chat/reaction DELETE", error);
    return NextResponse.json({ error: "Failed to remove reaction" }, { status: 500 });
  }
}

