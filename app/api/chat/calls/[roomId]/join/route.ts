import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getChatCallPolicy, logCallEvent } from "@/lib/chatCallGovernance";
import { resolveCallCorrelationId } from "@/lib/chat/callCorrelation";
import { normalizeCallClientKind, normalizeCallSessionId } from "@/lib/chat/callSessions";
import { buildFreshChatCallSessionWhereClause, expireStaleChatCallSessions } from "@/lib/chatCalls";

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

    const roomRes = await query(`SELECT id, conversation_id, provider, status FROM chat_call_rooms WHERE id = $1 LIMIT 1`, [roomId]);
    const room = roomRes.rows[0] as { id: number; conversation_id: number; provider: string; status: string } | undefined;
    if (!room) {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "Call room not found.", error: "Call room not found." },
        { status: 404 },
      );
    }
    if (room.provider !== "ats_native") {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "Unsupported call provider.", error: "Unsupported call provider." },
        { status: 400 },
      );
    }
    if (room.status === "ended" || room.status === "cancelled") {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "This call is no longer active.", error: "This call is no longer active." },
        { status: 409 },
      );
    }

    const member = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
      [room.conversation_id, access.user_id],
    );
    if (!member.rowCount) {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "Not a member of this conversation.", error: "Not a member of this conversation." },
        { status: 403 },
      );
    }
    const removedRes = await query(
      `SELECT 1 FROM chat_call_removed_participants WHERE room_id = $1 AND user_id = $2 LIMIT 1`,
      [roomId, access.user_id],
    );
    if (removedRes.rowCount) {
      await logCallEvent({
        roomId,
        conversationId: room.conversation_id,
        userId: access.user_id,
        eventType: "join_fail",
        metadata: { reason: "removed_by_moderator" },
      });
      return NextResponse.json(
        {
          operation_status: "blocked",
          user_message: "You were removed from this live call.",
          hint: "Start a new call to rejoin.",
        },
        { status: 403 },
      );
    }
    const requestKey = _request.headers.get("x-idempotency-key")?.trim() || "";
    const correlationId = resolveCallCorrelationId({
      correlationHeader: _request.headers.get("x-call-correlation-id"),
      idempotencyHeader: requestKey,
    });
    const body = await _request.json().catch(() => ({}));
    const sessionId = normalizeCallSessionId(body?.session_id) || `legacy-${access.user_id}`;
    const clientKind = normalizeCallClientKind(body?.client_kind, _request.headers.get("user-agent"));
    await expireStaleChatCallSessions({ roomId });
    const activeRowRes = await query(
      `SELECT 1 FROM chat_call_participants WHERE room_id = $1 AND user_id = $2 AND session_id = $3 AND left_at IS NULL LIMIT 1`,
      [roomId, access.user_id, sessionId],
    );
    const alreadyJoined = Boolean(activeRowRes.rowCount);
    const policy = await getChatCallPolicy();
    const joinedCountRes = await query(
      `SELECT COUNT(*)::int AS count FROM chat_call_participants p WHERE room_id = $1 AND ${buildFreshChatCallSessionWhereClause("p")}`,
      [roomId],
    );
    const joinedCount = Number((joinedCountRes.rows[0] as { count: number } | undefined)?.count || 0);
    if (!alreadyJoined && joinedCount >= policy.max_call_participants) {
      await logCallEvent({
        roomId,
        conversationId: room.conversation_id,
        userId: access.user_id,
        eventType: "join_fail",
        metadata: { reason: "max_participants", max: policy.max_call_participants, session_id: sessionId },
        correlationId,
      });
      return NextResponse.json(
        {
          operation_status: "blocked",
          user_message: "Call has reached maximum participants.",
          hint: `Max participants: ${policy.max_call_participants}`,
        },
        { status: 409 },
      );
    }
    if (!alreadyJoined) {
      await query(
        `
        INSERT INTO chat_call_participants (room_id, user_id, joined_at, left_at, muted, session_id, client_kind, last_seen_at)
        VALUES ($1, $2, NOW(), NULL, FALSE, $3, $4, NOW())
        `,
        [roomId, access.user_id, sessionId, clientKind],
      );
    } else {
      await query(
        `UPDATE chat_call_participants SET muted = FALSE, client_kind = $4, last_seen_at = NOW() WHERE room_id = $1 AND user_id = $2 AND session_id = $3 AND left_at IS NULL`,
        [roomId, access.user_id, sessionId, clientKind],
      );
    }
    await query(
      `UPDATE chat_call_rooms SET status = 'active', updated_at = NOW() WHERE id = $1 AND status IN ('scheduled','active')`,
      [roomId],
    );
    if (!alreadyJoined) {
      const joinEventAccepted = await logCallEvent({
        roomId,
        conversationId: room.conversation_id,
        userId: access.user_id,
        eventType: "join_success",
        eventKey: requestKey || `join_success:${roomId}:${access.user_id}`,
        correlationId,
      });
      if (joinEventAccepted) {
        await query(
          `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
          [room.conversation_id, access.user_id, "Joined call."],
        );
      }
    }
    try {
      await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [room.conversation_id]);
    } catch (error) {
      const requestId = crypto.randomUUID();
      console.error("[chat-call] join_touch_conversation_error", { request_id: requestId, error: error instanceof Error ? error.message : String(error) });
      console.warn("[chat-calls] failed to touch conversation timestamp on join", error);
    }

    const countRes = await query(
      `SELECT COUNT(*)::int AS count FROM chat_call_participants p WHERE room_id = $1 AND ${buildFreshChatCallSessionWhereClause("p")}`,
      [roomId],
    );
    return NextResponse.json({
      operation_status: "success",
      user_message: "Joined call room.",
      joined_count: Number((countRes.rows[0] as { count?: number } | undefined)?.count || 0),
      session_id: sessionId,
      correlation_id: correlationId,
      room_state: {
        room_id: roomId,
        conversation_id: room.conversation_id,
        status: "active",
      },
    });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("[chat-call] join_route_error", { request_id: requestId, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        operation_status: "error",
        user_message: "Unable to join call.",
        error: error instanceof Error ? error.message : "Failed to join call room.",
        request_id: requestId,
      },
      { status: 500 },
    );
  }
}
