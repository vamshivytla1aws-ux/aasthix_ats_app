import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { endChatCallRoom } from "@/lib/chatCalls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });

    const memberRes = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
      [conversationId, access.user_id],
    );
    if (!memberRes.rowCount) return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const reason = String(body?.reason || "ended").trim().slice(0, 80);
    const roomRes = await query(
      `SELECT id, title FROM chat_call_rooms WHERE conversation_id = $1 AND status IN ('active','scheduled') ORDER BY id DESC LIMIT 1`,
      [conversationId],
    );
    const room = roomRes.rows[0] as { id: number; title: string } | undefined;
    if (!room) {
      return NextResponse.json({
        operation_status: "success",
        user_message: "Call already ended.",
        room_closed_reason: "ended",
      });
    }
    const ended = await endChatCallRoom(Number(room.id), access.user_id);
    if (!ended) {
      return NextResponse.json({
        operation_status: "success",
        user_message: "Call already ended.",
        room_closed_reason: "ended",
      });
    }
    await query(`UPDATE chat_call_participants SET left_at = NOW() WHERE room_id = $1 AND left_at IS NULL`, [room.id]);
    await query(
      `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
      [conversationId, access.user_id, `Call ended (${reason}): ${room.title}`],
    );
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
    return NextResponse.json({
      operation_status: "success",
      user_message: "Call ended successfully.",
      room_id: Number(room.id),
      room_closed_reason: reason || "ended",
    });
  } catch (error) {
    return NextResponse.json(
      { operation_status: "error", error: error instanceof Error ? error.message : "Failed to end call." },
      { status: 500 },
    );
  }
}
