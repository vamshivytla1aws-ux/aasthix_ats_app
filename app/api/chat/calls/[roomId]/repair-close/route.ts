import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { logCallEvent } from "@/lib/chatCallGovernance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { roomId: string } }) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const roomId = Number(params.roomId);
    if (!Number.isFinite(roomId)) {
      return NextResponse.json({ operation_status: "blocked", user_message: "Invalid room id." }, { status: 400 });
    }
    const roomRes = await query(
      `SELECT id, conversation_id, status FROM chat_call_rooms WHERE id = $1 LIMIT 1`,
      [roomId],
    );
    const room = roomRes.rows[0] as { id: number; conversation_id: number; status: string } | undefined;
    if (!room) {
      return NextResponse.json({ operation_status: "blocked", user_message: "Call room not found." }, { status: 404 });
    }

    await query(
      `UPDATE chat_call_rooms
       SET status = 'ended', ended_at = COALESCE(ended_at, NOW()), updated_at = NOW()
       WHERE id = $1`,
      [roomId],
    );
    await query(`UPDATE chat_call_participants SET left_at = NOW() WHERE room_id = $1 AND left_at IS NULL`, [roomId]);
    await query(
      `INSERT INTO messages (conversation_id, sender_id, content, is_system)
       VALUES ($1, NULL, $2, TRUE)`,
      [room.conversation_id, "Call force-closed by admin repair."],
    );
    await logCallEvent({
      roomId,
      conversationId: room.conversation_id,
      eventType: "end",
      metadata: { reason: "repair_close" },
      eventKey: `repair_close:${roomId}`,
    });

    return NextResponse.json({
      operation_status: "success",
      user_message: "Call room force-closed successfully.",
      room_closed_reason: "repair_close",
    });
  } catch (error) {
    return NextResponse.json(
      { operation_status: "error", error: error instanceof Error ? error.message : "Failed to repair-close call room." },
      { status: 500 },
    );
  }
}
