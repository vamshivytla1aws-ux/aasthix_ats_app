import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logCallEvent } from "@/lib/chatCallGovernance";
import { closeChatCallRoomTransactional } from "@/lib/chatCalls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { roomId: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const roomId = Number(params.roomId);
    if (!Number.isFinite(roomId)) {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "Invalid room id.", error: "Invalid room id." },
        { status: 400 },
      );
    }
    const roomRes = await query(
      `SELECT id, conversation_id FROM chat_call_rooms WHERE id = $1 LIMIT 1`,
      [roomId],
    );
    const room = roomRes.rows[0] as { id: number; conversation_id: number } | undefined;
    if (!room) {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "Call room not found.", error: "Call room not found." },
        { status: 404 },
      );
    }

    const requestKey = _request.headers.get("x-idempotency-key")?.trim() || "";
    await query(
      `
      UPDATE chat_call_participants
      SET left_at = NOW()
      WHERE room_id = $1
        AND user_id = $2
        AND left_at IS NULL
      `,
      [roomId, access.user_id],
    );

    const openParticipants = await query(
      `SELECT 1 FROM chat_call_participants WHERE room_id = $1 AND left_at IS NULL LIMIT 1`,
      [roomId],
    );
    if (!openParticipants.rowCount) {
      await closeChatCallRoomTransactional({
        roomId,
        conversationId: room.conversation_id,
        endedByUserId: access.user_id,
        reason: "last_participant_left",
        systemMessage: "Call ended.",
        messageSenderId: access.user_id,
        eventUserId: access.user_id,
        eventKey: requestKey || `call_end:${roomId}:${access.user_id}`,
      });
    } else {
      const eventAccepted = await logCallEvent({
        roomId,
        conversationId: room.conversation_id,
        userId: access.user_id,
        eventType: "drop",
        eventKey: requestKey || `call_drop:${roomId}:${access.user_id}`,
      });
      if (eventAccepted) {
        await query(
          `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
          [room.conversation_id, access.user_id, "Left call."],
        );
      }
    }
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [room.conversation_id]);

    return NextResponse.json({ operation_status: "success", user_message: "Left call room." });
  } catch (error) {
    return NextResponse.json(
      {
        operation_status: "error",
        user_message: "Unable to leave call.",
        error: error instanceof Error ? error.message : "Failed to leave call room.",
      },
      { status: 500 },
    );
  }
}
