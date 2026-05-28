import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { logCallEvent } from "@/lib/chatCallGovernance";
import { resolveCallCorrelationId } from "@/lib/chat/callCorrelation";
import { requireCallSessionId } from "@/lib/chat/callSessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toFiniteNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(request: Request, { params }: { params: { roomId: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const roomId = Number(params.roomId);
    if (!Number.isFinite(roomId)) {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "Invalid room id." },
        { status: 400 },
      );
    }

    const roomRes = await query(
      `SELECT id, conversation_id, status FROM chat_call_rooms WHERE id = $1 LIMIT 1`,
      [roomId],
    );
    const room = roomRes.rows[0] as { id: number; conversation_id: number; status: string } | undefined;
    if (!room) {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "Call room not found." },
        { status: 404 },
      );
    }
    if (room.status === "ended" || room.status === "cancelled") {
      return NextResponse.json({
        operation_status: "success",
        user_message: "Telemetry ignored for terminal room.",
        ignored_due_to_terminal_room: true,
      });
    }

    const memberRes = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
      [room.conversation_id, access.user_id],
    );
    if (!memberRes.rowCount) {
      return NextResponse.json(
        { operation_status: "blocked", user_message: "Not a member of this conversation." },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const sessionId = requireCallSessionId(body?.session_id);
    const correlationId = resolveCallCorrelationId({
      correlationHeader: request.headers.get("x-call-correlation-id"),
      idempotencyHeader: request.headers.get("x-idempotency-key"),
    });
    const reason = String(body?.reason || "sample").trim().slice(0, 40) || "sample";
    const metadata = {
      reason,
      session_id: sessionId,
      livekit_identity_prefix: String(body?.livekit_identity_prefix || "").slice(0, 80) || null,
      call_state: String(body?.call_state || "unknown"),
      connection_state: String(body?.connection_state || "unknown"),
      media_state: String(body?.media_state || "unknown"),
      publish_state: String(body?.publish_state || "unknown"),
      subscribe_state: String(body?.subscribe_state || "unknown"),
      local_audio_track_present: Boolean(body?.local_audio_track_present),
      remote_audio_tracks_count: toFiniteNumber(body?.remote_audio_tracks_count, 0),
      audio_level: Math.max(0, Math.min(1, toFiniteNumber(body?.audio_level, 0))),
      mic_enabled: Boolean(body?.mic_enabled),
      camera_enabled: Boolean(body?.camera_enabled),
      autoplay_blocked: Boolean(body?.autoplay_blocked),
      device_state: String(body?.device_state || "unknown"),
      permission_state: String(body?.permission_state || "unknown"),
      media_error: String(body?.media_error || "").slice(0, 240),
      user_agent: String(request.headers.get("user-agent") || "").slice(0, 240),
      client_ts: String(body?.client_ts || new Date().toISOString()),
      joined_count_hint: toFiniteNumber(body?.joined_count_hint, 0),
      effective_media_state_reason: String(body?.effective_media_state_reason || "").slice(0, 80),
      recovery_attempt:
        body?.recovery_attempt && typeof body.recovery_attempt === "object"
          ? body.recovery_attempt
          : null,
      publish_attempt_id: String(body?.publish_attempt_id || "").slice(0, 120) || null,
      track_attach_count: toFiniteNumber(body?.track_attach_count, 0),
      remote_participant_count: toFiniteNumber(body?.remote_participant_count, 0),
      last_livekit_event: String(body?.last_livekit_event || "").slice(0, 80) || null,
      attempt_started_at: String(body?.attempt_started_at || "").slice(0, 80) || null,
      attempt_result: String(body?.attempt_result || "").slice(0, 40) || null,
      call_presence_state: String(body?.call_presence_state || "").slice(0, 40) || null,
      media_readiness_state: String(body?.media_readiness_state || "").slice(0, 40) || null,
      receiver_join_seen_at: String(body?.receiver_join_seen_at || "").slice(0, 80) || null,
      caller_bar_visible_at: String(body?.caller_bar_visible_at || "").slice(0, 80) || null,
      caller_visibility_delay_ms: toFiniteNumber(body?.caller_visibility_delay_ms, -1),
      caller_visibility_slo_miss: Boolean(body?.caller_visibility_slo_miss),
      prejoin_summary:
        body?.prejoin_summary && typeof body.prejoin_summary === "object"
          ? body.prejoin_summary
          : null,
    };

    await query(
      `
      UPDATE chat_call_participants
      SET last_seen_at = NOW()
      WHERE room_id = $1
        AND user_id = $2
        AND session_id = $3
        AND left_at IS NULL
      `,
      [roomId, access.user_id, sessionId],
    ).catch(() => null);

    await logCallEvent({
      roomId,
      conversationId: room.conversation_id,
      userId: access.user_id,
      eventType: "media_telemetry",
      metadata,
      eventKey: `media_telemetry:${roomId}:${access.user_id}:${sessionId}:${Date.now()}`,
      correlationId,
    });
    if (reason !== "interval") {
      console.info("[chat-call] telemetry_event", {
        room_id: roomId,
        conversation_id: room.conversation_id,
        user_id: access.user_id,
        session_id: sessionId,
        reason,
        call_state: metadata.call_state,
        connection_state: metadata.connection_state,
        media_state: metadata.media_state,
        publish_state: metadata.publish_state,
        subscribe_state: metadata.subscribe_state,
        local_audio_track_present: metadata.local_audio_track_present,
        remote_audio_tracks_count: metadata.remote_audio_tracks_count,
        correlation_id: correlationId,
      });
    }

    return NextResponse.json({
      operation_status: "success",
      user_message: "Telemetry captured.",
      correlation_id: correlationId,
    });
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("[chat-call] telemetry_route_error", { request_id: requestId, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { operation_status: "error", error: error instanceof Error ? error.message : "Failed to capture telemetry.", request_id: requestId },
      { status: 500 },
    );
  }
}
