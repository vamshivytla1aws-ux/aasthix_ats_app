import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { logCallEvent } from "@/lib/chatCallGovernance";
import { resolveCallCorrelationId } from "@/lib/chat/callCorrelation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { roomId: string } }) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const correlationId = resolveCallCorrelationId({
      correlationHeader: request.headers.get("x-call-correlation-id"),
      idempotencyHeader: request.headers.get("x-idempotency-key"),
    });
    const roomId = Number(params.roomId);
    if (!Number.isFinite(roomId)) {
      return NextResponse.json({ operation_status: "blocked", user_message: "Invalid room id.", correlation_id: correlationId }, { status: 400 });
    }
    const roomRes = await query(
      `SELECT id, conversation_id, status FROM chat_call_rooms WHERE id = $1 LIMIT 1`,
      [roomId],
    );
    const room = roomRes.rows[0] as { id: number; conversation_id: number; status: string } | undefined;
    if (!room) {
      return NextResponse.json({ operation_status: "blocked", user_message: "Call room not found.", correlation_id: correlationId }, { status: 404 });
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
      correlationId,
    });

    return NextResponse.json({
      operation_status: "success",
      user_message: "Call room force-closed successfully.",
      room_closed_reason: "repair_close",
      correlation_id: correlationId,
    });
  } catch (error) {
    return NextResponse.json(
      { operation_status: "error", error: error instanceof Error ? error.message : "Failed to repair-close call room." },
      { status: 500 },
    );
  }
}
