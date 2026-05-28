import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logCallEvent } from "@/lib/chatCallGovernance";
import { resolveCallCorrelationId } from "@/lib/chat/callCorrelation";
import { expireStaleChatCallSessions } from "@/lib/chatCalls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
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
    await expireStaleChatCallSessions();

    const roomRes = await query(
      `SELECT id, title FROM chat_call_rooms WHERE conversation_id = $1 AND status IN ('active','scheduled') ORDER BY id DESC LIMIT 1`,
      [conversationId],
    );
    const room = roomRes.rows[0] as { id: number; title: string } | undefined;
    if (!room) return NextResponse.json({ operation_status: "blocked", user_message: "No active call to ring." }, { status: 409 });

    const requestKey = _request.headers.get("x-idempotency-key")?.trim() || "";
    const correlationId = resolveCallCorrelationId({
      correlationHeader: _request.headers.get("x-call-correlation-id"),
      idempotencyHeader: requestKey,
    });
    const ringLogged = await logCallEvent({
      roomId: Number(room.id),
      conversationId,
      userId: access.user_id,
      eventType: "ring",
      eventKey: requestKey || `ring:${room.id}:${access.user_id}`,
      metadata: { title: room.title },
      correlationId,
    });
    if (ringLogged) {
      await query(
        `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
        [conversationId, access.user_id, `Incoming call: ${room.title}`],
      );
    }
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
    return NextResponse.json({
      operation_status: "success",
      user_message: "Call ring signal sent.",
      room_id: Number(room.id),
      correlation_id: correlationId,
      event_accepted: ringLogged,
      idempotent_replay: !ringLogged,
    });
  } catch (error) {
    return NextResponse.json(
      { operation_status: "error", error: error instanceof Error ? error.message : "Failed to ring participants." },
      { status: 500 },
    );
  }
}
