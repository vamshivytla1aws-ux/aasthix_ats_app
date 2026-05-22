import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { resolveCallCorrelationId } from "@/lib/chat/callCorrelation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { roomId: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const correlationId = resolveCallCorrelationId({
      correlationHeader: _request.headers.get("x-call-correlation-id"),
      idempotencyHeader: _request.headers.get("x-idempotency-key"),
    });
    const roomId = Number(params.roomId);
    if (!Number.isFinite(roomId)) return NextResponse.json({ operation_status: "blocked", user_message: "Invalid room id." }, { status: 400 });

    const roomRes = await query(
      `SELECT id, conversation_id, title, status, mode, start_at, end_at, ended_at, created_by_user_id
       FROM chat_call_rooms WHERE id = $1 LIMIT 1`,
      [roomId],
    );
    const room = roomRes.rows[0] as {
      id: number; conversation_id: number; title: string; status: string; mode: string;
      start_at: string; end_at: string; ended_at: string | null; created_by_user_id: number | null;
    } | undefined;
    if (!room) return NextResponse.json({ operation_status: "blocked", user_message: "Call room not found." }, { status: 404 });

    const memberRes = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
      [room.conversation_id, access.user_id],
    );
    if (!memberRes.rowCount) return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });

    const participantsRes = await query(
      `SELECT p.user_id, COALESCE(u.full_name, 'Unknown user') AS full_name, p.joined_at, p.left_at, p.muted, p.is_presenting
       FROM chat_call_participants p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.room_id = $1
       ORDER BY p.joined_at DESC
       LIMIT 50`,
      [roomId],
    );
    const activeParticipants = (participantsRes.rows as Array<{ user_id: number; full_name: string; left_at: string | null }>)
      .filter((row) => !row.left_at)
      .map((row) => ({ user_id: Number(row.user_id), full_name: String(row.full_name || "Unknown user") }));
    const eventsRes = await query(
      `SELECT event_type, metadata, created_at, user_id
       FROM chat_call_events
       WHERE room_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [roomId],
    );
    const telemetryRes = await query(
      `
      SELECT DISTINCT ON (e.user_id)
        e.user_id,
        COALESCE(u.full_name, 'Unknown user') AS full_name,
        e.created_at,
        e.metadata
      FROM chat_call_events e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE e.room_id = $1
        AND e.event_type = 'media_telemetry'
        AND e.user_id IS NOT NULL
      ORDER BY e.user_id, e.created_at DESC
      `,
      [roomId],
    );
    const telemetryTimelineRes = await query(
      `
      SELECT e.user_id,
             COALESCE(u.full_name, 'Unknown user') AS full_name,
             e.created_at,
             e.metadata
      FROM chat_call_events e
      LEFT JOIN users u ON u.id = e.user_id
      WHERE e.room_id = $1
        AND e.event_type = 'media_telemetry'
      ORDER BY e.created_at DESC
      LIMIT 40
      `,
      [roomId],
    );
    const latestTelemetry = telemetryRes.rows as Array<{
      user_id: number;
      full_name: string;
      created_at: string;
      metadata?: Record<string, unknown> | null;
    }>;
    const nowMs = Date.now();
    const freshTelemetry = latestTelemetry.filter((row) => {
      const ageMs = Math.max(0, nowMs - new Date(row.created_at).getTime());
      return ageMs <= 20_000;
    });
    const isTerminalRoom = room.status === "ended" || room.status === "cancelled";
    const telemetryForHealth = freshTelemetry.length > 0 ? freshTelemetry : latestTelemetry;
    const telemetryStates = telemetryForHealth.map((row) => row.metadata || {});
    const anyWaitingRemote = telemetryStates.some((m) => String(m.subscribe_state || "") === "waiting_remote");
    const anyRemoteZero = telemetryStates.some((m) => Number(m.remote_audio_tracks_count || 0) <= 0);
    const anyAutoplayBlocked = telemetryStates.some((m) => Boolean(m.autoplay_blocked));
    const anyPublishMissing = telemetryStates.some(
      (m) => String(m.publish_state || "") !== "published" || !Boolean(m.local_audio_track_present),
    );
    const allReconnecting =
      telemetryStates.length > 0 && telemetryStates.every((m) => String(m.connection_state || "") === "reconnecting");
    const lastMediaFailure = telemetryStates
      .map((m) => String(m.media_error || "").trim())
      .find((value) => Boolean(value));
    let mediaHealth: "ok" | "reconnect_loop" | "no_remote_tracks" | "playback_blocked" | "publish_missing" = "ok";
    if (room.status === "ended" || room.status === "cancelled") {
      mediaHealth = "ok";
    } else if (allReconnecting) mediaHealth = "reconnect_loop";
    else if (anyAutoplayBlocked) mediaHealth = "playback_blocked";
    else if (anyPublishMissing) mediaHealth = "publish_missing";
    else if (anyWaitingRemote || anyRemoteZero) mediaHealth = "no_remote_tracks";
    const latestConnectionState =
      telemetryStates.find((m) => Boolean(m.connection_state))?.connection_state || null;
    const latestMediaState =
      telemetryStates.find((m) => Boolean(m.media_state))?.media_state || null;
    const roomConnectionState = isTerminalRoom
      ? "idle"
      : telemetryStates.some((m) => String(m.connection_state || "") === "reconnecting")
        ? "reconnecting"
        : telemetryStates.some((m) => String(m.connection_state || "") === "connecting")
          ? "connecting"
          : telemetryStates.length > 0 && telemetryStates.every((m) => String(m.connection_state || "") === "connected")
            ? "connected"
            : (room.status === "active" ? "connected" : room.status === "scheduled" ? "connecting" : "idle");
    const roomAllPublished =
      telemetryStates.length > 0 &&
      telemetryStates.every((m) => String(m.publish_state || "") === "published" && Boolean(m.local_audio_track_present));
    const roomRemoteTracksMax = telemetryStates.reduce((max, m) => Math.max(max, Number(m.remote_audio_tracks_count || 0)), 0);
    const roomSubscribeState = isTerminalRoom ? "waiting_remote" : roomRemoteTracksMax > 0 ? "subscribed" : "waiting_remote";
    const roomPublishState = isTerminalRoom ? "pending" : roomAllPublished ? "published" : "muted_or_unpublished";
    const roomMediaState = isTerminalRoom
      ? "ok"
      : telemetryStates.some((m) => String(m.media_state || "") === "failed")
        ? "failed"
        : String(latestMediaState || "") || "ok";
    const endedAtMs = room.ended_at ? new Date(room.ended_at).getTime() : null;
    const postEndTelemetryIgnored =
      endedAtMs === null
        ? 0
        : (telemetryTimelineRes.rows as Array<{ created_at: string }>).filter(
            (row) => new Date(row.created_at).getTime() > endedAtMs,
          ).length;
    const effectiveMediaByUser = latestTelemetry.map((row) => {
      const metadata = (row.metadata || {}) as Record<string, unknown>;
      const connection = String(metadata.connection_state || "");
      const publishState = String(metadata.publish_state || "");
      const subscribeState = String(metadata.subscribe_state || "");
      const localTrack = Boolean(metadata.local_audio_track_present);
      const remoteCount = Number(metadata.remote_audio_tracks_count || 0);
      const autoplayBlocked = Boolean(metadata.autoplay_blocked);
      const metadataReason = String(metadata.effective_media_state_reason || "");
      const ageMs = Math.max(0, nowMs - new Date(row.created_at).getTime());
      let effective_media_state: "connected" | "reconnecting" | "publish_missing" | "waiting_remote" | "playback_blocked" | "idle" =
        "idle";
      let effective_media_state_reason = "idle";
      if (connection === "reconnecting") effective_media_state = "reconnecting";
      if (effective_media_state === "reconnecting") effective_media_state_reason = "room_reconnecting";
      else if (metadataReason === "publish_recovering") {
        effective_media_state = "waiting_remote";
        effective_media_state_reason = "publish_recovering";
      }
      else if (autoplayBlocked) {
        effective_media_state = "playback_blocked";
        effective_media_state_reason = "autoplay_blocked";
      } else if (publishState !== "published" || !localTrack) {
        effective_media_state = "publish_missing";
        effective_media_state_reason = "publish_missing_local_track";
      } else if (subscribeState !== "subscribed" || remoteCount <= 0) {
        effective_media_state = "waiting_remote";
        effective_media_state_reason = "waiting_remote_tracks";
      } else {
        effective_media_state = "connected";
        effective_media_state_reason = "tracks_subscribed";
      }
      return {
        user_id: String(row.user_id),
        full_name: String(row.full_name || "Unknown user"),
        created_at: row.created_at,
        effective_media_state: isTerminalRoom ? "idle" : effective_media_state,
        effective_media_state_reason: isTerminalRoom ? "terminal_room" : effective_media_state_reason,
        telemetry_freshness_ms: ageMs,
      };
    });
    const recentErrors = (eventsRes.rows as Array<{ event_type: string; metadata: unknown; created_at: string }>)
      .filter((e) => e.event_type.includes("fail") || e.event_type.includes("blocked"))
      .slice(0, 8);
    const closeReasonRow = (eventsRes.rows as Array<{ event_type: string; metadata?: { reason?: string } }>)
      .find((row) => row.event_type === "end");
    const roomClosedReason = String(closeReasonRow?.metadata?.reason || "");
    const localInRoom = activeParticipants.some((p) => Number(p.user_id) === Number(access.user_id));
    const secondJoinRes = await query(
      `
      WITH per_user AS (
        SELECT user_id, MIN(joined_at) AS first_joined_at
        FROM chat_call_participants
        WHERE room_id = $1
        GROUP BY user_id
      ),
      ordered AS (
        SELECT first_joined_at, ROW_NUMBER() OVER (ORDER BY first_joined_at ASC) AS rn
        FROM per_user
      )
      SELECT first_joined_at AS second_joined_at
      FROM ordered
      WHERE rn = 2
      LIMIT 1
      `,
      [roomId],
    );
    const firstJoinedAt =
      (secondJoinRes.rows[0] as { second_joined_at?: string | null } | undefined)?.second_joined_at || null;

    return NextResponse.json({
      operation_status: "success",
      correlation_id: correlationId,
      diagnostics: {
        room: {
          ...room,
          joined_count: activeParticipants.length,
          joined_participants: activeParticipants,
          room_closed_reason: roomClosedReason || null,
          connection_state: roomConnectionState,
          media_state: roomMediaState,
          is_active: !isTerminalRoom && (room.status === "active" || room.status === "scheduled"),
          can_join: !isTerminalRoom && (room.status === "active" || room.status === "scheduled"),
          can_end:
            !isTerminalRoom && (room.status === "active" || room.status === "scheduled")
              ? (Number(room.created_by_user_id || 0) === Number(access.user_id) || activeParticipants.some((p) => Number(p.user_id) === Number(access.user_id)))
              : false,
          subscribe_state: roomSubscribeState,
          local_audio_track_present: isTerminalRoom ? false : roomAllPublished,
          remote_audio_tracks_count: isTerminalRoom ? 0 : roomRemoteTracksMax,
          publish_state: roomPublishState,
          autoplay_blocked: false,
          permission_state: "granted",
          device_state: "ready",
          media_health: isTerminalRoom ? "ok" : mediaHealth,
          remote_track_seen: activeParticipants.length > 1 && !anyRemoteZero,
          playback_started: !anyAutoplayBlocked && activeParticipants.length > 1 && !anyRemoteZero,
          last_media_failure_reason: lastMediaFailure || null,
          effective_media_state: isTerminalRoom
            ? "idle"
            :
            mediaHealth === "reconnect_loop"
              ? "reconnecting"
              : mediaHealth === "publish_missing"
                ? "publish_missing"
                : mediaHealth === "no_remote_tracks"
                  ? "waiting_remote"
                  : mediaHealth === "playback_blocked"
                    ? "playback_blocked"
                    : activeParticipants.length > 1
                      ? "connected"
                      : "idle",
          timing_markers: {
            room_started_at: room.start_at,
            first_remote_joined_at: firstJoinedAt,
          },
          health_action_hint: isTerminalRoom
            ? "none"
            : mediaHealth === "publish_missing"
              ? "ask_user_to_retry_publish"
              : mediaHealth === "no_remote_tracks"
                ? "retry_remote_subscribe_once"
                : mediaHealth === "playback_blocked"
                  ? "request_user_interaction_for_playback"
                  : "none",
          aggregation_basis: "room_fresh_telemetry",
        },
        participants: participantsRes.rows,
        latest_telemetry_by_user: telemetryRes.rows,
        effective_media_by_user: effectiveMediaByUser,
        post_end_telemetry_ignored: postEndTelemetryIgnored,
        telemetry_timeline: telemetryTimelineRes.rows,
        recent_events: eventsRes.rows,
        recent_errors: recentErrors,
      },
    });
  } catch (error) {
    return NextResponse.json({ operation_status: "error", error: error instanceof Error ? error.message : "Failed to fetch call diagnostics." }, { status: 500 });
  }
}
