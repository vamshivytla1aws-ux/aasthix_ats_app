import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  buildLiveKitRoomName,
  createLiveKitToken,
  isLiveKitConfigured,
  liveKitUrl,
  parseRtcIceServers,
} from "@/lib/livekit";
import { resolveCallCorrelationId } from "@/lib/chat/callCorrelation";
import { buildCallLiveKitIdentity, normalizeCallClientKind, normalizeCallSessionId } from "@/lib/chat/callSessions";
import { expireStaleChatCallSessions } from "@/lib/chatCalls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!isLiveKitConfigured()) {
      return NextResponse.json(
        {
          operation_status: "blocked",
          user_message: "LiveKit is not configured.",
          hint: "Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.",
          media_health_hint: "livekit_not_configured",
        },
        { status: 503 },
      );
    }
    const access = gate.access;
    const requestKey = _request.headers.get("x-idempotency-key")?.trim() || "";
    const correlationId = resolveCallCorrelationId({
      correlationHeader: _request.headers.get("x-call-correlation-id"),
      idempotencyHeader: requestKey,
    });
    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
    }
    const memberRes = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
      [conversationId, access.user_id],
    );
    if (!memberRes.rowCount) return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });
    const body = await _request.json().catch(() => ({}));
    const sessionId = normalizeCallSessionId(body?.session_id) || `legacy-${access.user_id}`;
    const clientKind = normalizeCallClientKind(body?.client_kind, _request.headers.get("user-agent"));
    const iceConfig = parseRtcIceServers(String(process.env.NEXT_PUBLIC_CHAT_ICE_SERVERS || ""));
    await expireStaleChatCallSessions();

    const roomRes = await query(
      `SELECT id, conversation_id FROM chat_call_rooms WHERE conversation_id = $1 AND status IN ('active','scheduled') ORDER BY id DESC LIMIT 1`,
      [conversationId],
    );
    const room = roomRes.rows[0] as { id: number; conversation_id: number } | undefined;
    if (!room) {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "No active or scheduled call found." },
        { status: 409 },
      );
    }
    const activeParticipantRes = await query(
      `SELECT 1 FROM chat_call_participants WHERE room_id = $1 AND user_id = $2 AND session_id = $3 AND left_at IS NULL LIMIT 1`,
      [room.id, access.user_id, sessionId],
    );
    if (!activeParticipantRes.rowCount) {
      return NextResponse.json(
        {
          operation_status: "blocked",
          user_message: "Join call room before requesting media token.",
          hint: "Call /join first, then request token.",
          media_health_hint: "token_issue_failed",
        },
        { status: 409 },
      );
    }
    const removedRes = await query(
      `SELECT 1 FROM chat_call_removed_participants WHERE room_id = $1 AND user_id = $2 LIMIT 1`,
      [room.id, access.user_id],
    );
    if (removedRes.rowCount) {
      return NextResponse.json(
        {
          operation_status: "blocked",
          user_message: "You were removed from this live call.",
        },
        { status: 403 },
      );
    }
    const userRes = await query(`SELECT full_name FROM users WHERE id = $1 LIMIT 1`, [access.user_id]);
    const fullName = String((userRes.rows[0] as { full_name?: string } | undefined)?.full_name || `User ${access.user_id}`);
    const roomName = buildLiveKitRoomName(conversationId, Number(room.id));
    const identity = buildCallLiveKitIdentity({
      userId: access.user_id,
      roomId: Number(room.id),
      sessionId,
    });
    await query(
      `
      UPDATE chat_call_participants
      SET livekit_identity = $4,
          client_kind = $5,
          last_seen_at = NOW()
      WHERE room_id = $1
        AND user_id = $2
        AND session_id = $3
        AND left_at IS NULL
      `,
      [Number(room.id), access.user_id, sessionId, identity, clientKind],
    );
    const token = await createLiveKitToken({
      identity,
      name: fullName,
      roomName,
    });
    console.info("[chat-call] token_issued", {
      room_id: Number(room.id),
      conversation_id: conversationId,
      user_id: access.user_id,
      session_id: sessionId,
      identity_prefix: identity.slice(0, 20),
      ice_has_turn: iceConfig.hasTurn,
      ice_parse_error: iceConfig.parseError,
      correlation_id: correlationId,
    });
    return NextResponse.json({
      operation_status: "success",
      room_id: Number(room.id),
      room_name: roomName,
      session_id: sessionId,
      livekit_identity: identity,
      livekit_url: liveKitUrl(),
      token,
      media_state: "ready",
      turn_ready: iceConfig.hasTurn,
      ice_parse_error: iceConfig.parseError,
      correlation_id: correlationId,
      media_health_hint: iceConfig.hasTurn ? "ok" : "manual_turn_config_missing",
    });
  } catch (error) {
    const requestId = randomUUID();
    console.error("[chat-call] token_route_error", { request_id: requestId, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      {
        operation_status: "error",
        error: error instanceof Error ? error.message : "Failed to issue call token.",
        request_id: requestId,
        media_health_hint: "token_issue_failed",
      },
      { status: 500 },
    );
  }
}
