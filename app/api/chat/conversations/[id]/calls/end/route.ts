import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { closeChatCallRoomTransactional } from "@/lib/chatCalls";
import { resolveCallCorrelationId } from "@/lib/chat/callCorrelation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "Invalid conversation id.", error: "Invalid conversation id." },
        { status: 400 },
      );
    }

    const memberRes = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
      [conversationId, access.user_id],
    );
    if (!memberRes.rowCount) {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "Not a member of this conversation.", error: "Not a member of this conversation." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const reason = String(body?.reason || "ended").trim().slice(0, 80);
    const requestKey = request.headers.get("x-idempotency-key")?.trim() || "";
    const correlationId = resolveCallCorrelationId({
      correlationHeader: request.headers.get("x-call-correlation-id"),
      idempotencyHeader: requestKey,
    });
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
    const closed = await closeChatCallRoomTransactional({
      roomId: Number(room.id),
      conversationId,
      endedByUserId: access.user_id,
      reason: "ended",
      systemMessage: "Call ended.",
      messageSenderId: access.user_id,
      eventUserId: access.user_id,
      eventKey: requestKey || `call_end:${room.id}:${access.user_id}`,
      correlationId,
    });
    if (!closed.closed) {
      return NextResponse.json({
        operation_status: "success",
        user_message: "Call already ended.",
        room_closed_reason: "ended",
        correlation_id: correlationId,
        idempotent_replay: true,
      });
    }
    return NextResponse.json({
      operation_status: "success",
      user_message: "Call ended successfully.",
      room_id: Number(room.id),
      room_closed_reason: reason || "ended",
      room_status: "ended",
      is_active: false,
      can_join: false,
      can_end: false,
      connection_state: "idle",
      event_accepted: closed.event_accepted,
      correlation_id: correlationId,
      idempotent_replay: !closed.event_accepted,
    });
  } catch (error) {
    return NextResponse.json(
      {
        operation_status: "error",
        user_message: "Unable to end call.",
        error: error instanceof Error ? error.message : "Failed to end call.",
      },
      { status: 500 },
    );
  }
}
