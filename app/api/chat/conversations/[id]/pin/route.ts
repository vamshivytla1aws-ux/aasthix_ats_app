import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { requireConversationMember } from "@/lib/chat/v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    if (!(await requireConversationMember(conversationId, access.user_id))) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const body = await request.json();
    const messageId = Number(body?.message_id);
    if (!Number.isFinite(messageId)) return NextResponse.json({ error: "message_id required" }, { status: 400 });

    const msgCheck = await query(`SELECT 1 FROM messages WHERE id = $1 AND conversation_id = $2`, [messageId, conversationId]);
    if (!msgCheck.rowCount) return NextResponse.json({ error: "Message not found in conversation" }, { status: 404 });

    await query(
      `INSERT INTO conversation_pins (conversation_id, message_id, pinned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (conversation_id, message_id) DO NOTHING`,
      [conversationId, messageId, access.user_id]
    );
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
    return NextResponse.json({ operation_status: "success", user_message: "Message pinned." });
  } catch (error) {
    console.error("chat pin POST", error);
    return NextResponse.json({ error: "Failed to pin message" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    if (!(await requireConversationMember(conversationId, access.user_id))) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const messageId = Number(searchParams.get("message_id"));
    if (!Number.isFinite(messageId)) return NextResponse.json({ error: "message_id query param required" }, { status: 400 });

    await query(
      `DELETE FROM conversation_pins WHERE conversation_id = $1 AND message_id = $2`,
      [conversationId, messageId]
    );
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
    return NextResponse.json({ operation_status: "success", user_message: "Message unpinned." });
  } catch (error) {
    console.error("chat pin DELETE", error);
    return NextResponse.json({ error: "Failed to unpin message" }, { status: 500 });
  }
}

