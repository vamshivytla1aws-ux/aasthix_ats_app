import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { buildLiveKitRoomName } from "@/lib/livekit";
import { logCallEvent } from "@/lib/chatCallGovernance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getSignalSchemaHealthInline() {
  const requiredTypes = [
    "offer",
    "answer",
    "ice",
    "leave",
    "presenting",
    "media_repair",
    "moderation_mute",
    "moderation_unmute",
    "moderation_remove",
    "moderation_end",
  ] as const;
  const res = await query(
    `
    SELECT pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conname = 'chat_call_signals_type_chk'
      AND conrelid = 'chat_call_signals'::regclass
    LIMIT 1
    `,
  );
  const def = String((res.rows[0] as { def?: string } | undefined)?.def || "");
  const missingTypes = requiredTypes.filter((type) => !def.includes(`'${type}'`));
  return {
    schema_ready: missingTypes.length === 0,
    missing_types: missingTypes,
    required_types: [...requiredTypes],
  };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
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

    const roomRes = await query(
      `
      SELECT id, status, session_mode, start_at, end_at, created_by_user_id
      FROM (
        SELECT id, status, mode AS session_mode, start_at, end_at, created_by_user_id
        FROM chat_call_rooms
        WHERE conversation_id = $1
        ORDER BY
          CASE WHEN status IN ('active', 'scheduled') THEN 0 ELSE 1 END,
          id DESC
        LIMIT 1
      ) t
      `,
      [conversationId],
    );
    const room = roomRes.rows[0] as
      | { id: number; status: string; session_mode: "call" | "screenshare"; start_at: string; end_at: string; created_by_user_id: number | null }
      | undefined;
    if (!room) return NextResponse.json({ operation_status: "success", call: null });

    const participantsRes = await query(
      `
      SELECT p.user_id, COALESCE(u.full_name, 'Unknown user') AS full_name, COALESCE(p.muted, FALSE) AS muted
      FROM chat_call_participants p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.room_id = $1 AND p.left_at IS NULL
      ORDER BY p.joined_at ASC
      `,
      [room.id],
    );
    const participants = (participantsRes.rows as Array<{ user_id: number; full_name: string; muted?: boolean }>).map((p) => ({
      user_id: Number(p.user_id),
      full_name: String(p.full_name || "Unknown user"),
      muted: Boolean(p.muted),
    }));
    const isTerminal = room.status === "ended" || room.status === "cancelled";
    const isActiveLike = room.status === "active" || room.status === "scheduled";
    const meJoined = participants.some((p) => Number(p.user_id) === Number(access.user_id));

    if (room.status === "active" && participants.length === 0) {
      const ageMs = Date.now() - new Date(room.start_at).getTime();
      if (ageMs >= 20_000) {
        const closeRes = await query(
          `UPDATE chat_call_rooms
           SET status = 'ended', ended_at = NOW(), updated_at = NOW()
           WHERE id = $1 AND status = 'active'
           RETURNING id`,
          [room.id],
        );
        if (closeRes.rowCount) {
          await query(`UPDATE chat_call_participants SET left_at = NOW() WHERE room_id = $1 AND left_at IS NULL`, [room.id]);
          await logCallEvent({
            roomId: room.id,
            conversationId,
            eventType: "end",
            metadata: { reason: "timeout" },
            eventKey: `auto_timeout:${room.id}`,
          });
          await query(
            `INSERT INTO messages (conversation_id, sender_id, content, is_system)
             VALUES ($1, NULL, $2, TRUE)`,
            [conversationId, "Call ended due to no participants."],
          );
          return NextResponse.json({ operation_status: "success", call: null });
        }
      }
    }
    const presentingRes = await query(
      `
      SELECT from_user_id, payload
      FROM chat_call_signals
      WHERE room_id = $1
        AND signal_type = 'presenting'
      ORDER BY id DESC
      LIMIT 1
      `,
      [room.id],
    );
    const presentingRow = presentingRes.rows[0] as { from_user_id: number; payload: { enabled?: boolean } } | undefined;
    const isPresenting = Boolean(presentingRow?.payload?.enabled);
    const presenterUserId = isPresenting ? Number(presentingRow?.from_user_id || 0) : null;
    const telemetryRes = await query(
      `
      SELECT DISTINCT ON (e.user_id)
        e.user_id,
        e.created_at,
        e.metadata
      FROM chat_call_events e
      WHERE e.room_id = $1
        AND e.event_type = 'media_telemetry'
        AND e.user_id IS NOT NULL
      ORDER BY e.user_id, e.created_at DESC
      `,
      [room.id],
    );
    const latestTelemetry = telemetryRes.rows as Array<{
      user_id: number;
      created_at: string;
      metadata?: Record<string, unknown> | null;
    }>;
    const nowMs = Date.now();
    const freshTelemetry = latestTelemetry.filter((row) => {
      const ageMs = Math.max(0, nowMs - new Date(row.created_at).getTime());
      return ageMs <= 20_000;
    });
    const telemetryForRoom = freshTelemetry.length > 0 ? freshTelemetry : latestTelemetry;
    const telemetryStates = telemetryForRoom.map((row) => row.metadata || {});
    const endEventRes = await query(
      `SELECT metadata
       FROM chat_call_events
       WHERE room_id = $1 AND event_type = 'end'
       ORDER BY id DESC
       LIMIT 1`,
      [room.id],
    );
    const roomClosedReason = String((endEventRes.rows[0] as { metadata?: { reason?: string } } | undefined)?.metadata?.reason || "");
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
      [room.id],
    );
    const firstJoinedAt =
      (secondJoinRes.rows[0] as { second_joined_at?: string | null } | undefined)?.second_joined_at || null;
    const roomConnectionState = isTerminal
      ? "idle"
      : telemetryStates.some((m) => String(m.connection_state || "") === "reconnecting")
        ? "reconnecting"
        : telemetryStates.some((m) => String(m.connection_state || "") === "connecting")
          ? "connecting"
          : telemetryStates.length > 0 && telemetryStates.every((m) => String(m.connection_state || "") === "connected")
            ? "connected"
            : room.status === "active"
              ? "connected"
              : room.status === "scheduled"
                ? "connecting"
                : "idle";
    const roomAllPublished =
      telemetryStates.length > 0 &&
      telemetryStates.every((m) => String(m.publish_state || "") === "published" && Boolean(m.local_audio_track_present));
    const roomAnyPublished = telemetryStates.some((m) => String(m.publish_state || "") === "published");
    const roomRemoteTracksMax = telemetryStates.reduce((max, m) => Math.max(max, Number(m.remote_audio_tracks_count || 0)), 0);
    const publishState = isTerminal ? "pending" : roomAllPublished || roomAnyPublished ? "published" : "muted_or_unpublished";
    const subscribeState = isTerminal ? "waiting_remote" : roomRemoteTracksMax > 0 ? "subscribed" : "waiting_remote";
    const mediaState = isTerminal
      ? "ok"
      : telemetryStates.some((m) => String(m.media_state || "") === "failed")
        ? "failed"
        : "ok";
    const anyWaitingRemote = telemetryStates.some((m) => String(m.subscribe_state || "") === "waiting_remote");
    const anyRemoteZero = telemetryStates.some((m) => Number(m.remote_audio_tracks_count || 0) <= 0);
    const anyAutoplayBlocked = telemetryStates.some((m) => Boolean(m.autoplay_blocked));
    const anyPublishMissing = telemetryStates.some(
      (m) => String(m.publish_state || "") !== "published" || !Boolean(m.local_audio_track_present),
    );
    const allReconnecting =
      telemetryStates.length > 0 && telemetryStates.every((m) => String(m.connection_state || "") === "reconnecting");
    let mediaHealth: "ok" | "reconnect_loop" | "no_remote_tracks" | "playback_blocked" | "publish_missing" = "ok";
    if (isTerminal) mediaHealth = "ok";
    else if (allReconnecting) mediaHealth = "reconnect_loop";
    else if (anyAutoplayBlocked) mediaHealth = "playback_blocked";
    else if (anyPublishMissing) mediaHealth = "publish_missing";
    else if (anyWaitingRemote || anyRemoteZero) mediaHealth = "no_remote_tracks";
    const signalSchema = await getSignalSchemaHealthInline().catch(() => ({
      schema_ready: false,
      missing_types: [] as string[],
      required_types: [] as string[],
    }));
    const effectiveMediaState =
      isTerminal
        ? "idle"
        : mediaHealth === "reconnect_loop"
          ? "reconnecting"
          : mediaHealth === "publish_missing"
            ? "publish_missing"
            : mediaHealth === "no_remote_tracks"
              ? "waiting_remote"
              : mediaHealth === "playback_blocked"
                ? "playback_blocked"
                : participants.length > 1
                  ? "connected"
                  : "idle";
    return NextResponse.json({
      operation_status: "success",
      call: {
        ...room,
        room_name: buildLiveKitRoomName(conversationId, Number(room.id)),
        joined_count: participants.length,
        joined_participants: participants,
        is_active: isActiveLike && !isTerminal,
        status_kind: isPresenting || room.session_mode === "screenshare" ? "presenting" : "in_call",
        is_presenting: isPresenting,
        presenter_user_id: presenterUserId,
        room_closed_reason: roomClosedReason || null,
        connection_state: roomConnectionState,
        media_state: mediaState,
        can_join: !isTerminal && isActiveLike,
        can_end: !isTerminal && (Number(room.created_by_user_id || 0) === Number(access.user_id) || meJoined),
        publish_state: publishState,
        subscribe_state: subscribeState,
        local_audio_track_present: isTerminal ? false : roomAllPublished,
        remote_audio_tracks_count: isTerminal ? 0 : roomRemoteTracksMax,
        effective_media_state: effectiveMediaState,
        autoplay_blocked: false,
        permission_state: "granted",
        device_state: "ready",
        media_health: mediaHealth,
        signal_schema_ready: Boolean(signalSchema.schema_ready),
        timing_markers: {
          room_started_at: room.start_at,
          first_remote_joined_at: firstJoinedAt,
        },
        health_action_hint: isTerminal
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
    });
  } catch (error) {
    return NextResponse.json(
      { operation_status: "error", error: error instanceof Error ? error.message : "Failed to load call state." },
      { status: 500 },
    );
  }
}
