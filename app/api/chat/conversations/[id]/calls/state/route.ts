import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { buildLiveKitRoomName } from "@/lib/livekit";
import { logCallEvent } from "@/lib/chatCallGovernance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      SELECT p.user_id, COALESCE(u.full_name, 'Unknown user') AS full_name
      FROM chat_call_participants p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.room_id = $1 AND p.left_at IS NULL
      ORDER BY p.joined_at ASC
      `,
      [room.id],
    );
    const participants = (participantsRes.rows as Array<{ user_id: number; full_name: string }>).map((p) => ({
      user_id: Number(p.user_id),
      full_name: String(p.full_name || "Unknown user"),
    }));
    const isTerminal = room.status === "ended" || room.status === "cancelled";
    const isActiveLike = room.status === "active" || room.status === "scheduled";
    const meJoined = participants.some((p) => Number(p.user_id) === Number(access.user_id));

    if (room.status === "active" && participants.length === 0) {
      const ageMs = Date.now() - new Date(room.start_at).getTime();
      if (ageMs >= 60_000) {
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
            [conversationId, "call_ended: Call ended due to no participants"],
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
    const endEventRes = await query(
      `SELECT metadata
       FROM chat_call_events
       WHERE room_id = $1 AND event_type = 'end'
       ORDER BY id DESC
       LIMIT 1`,
      [room.id],
    );
    const roomClosedReason = String((endEventRes.rows[0] as { metadata?: { reason?: string } } | undefined)?.metadata?.reason || "");
    const firstJoinRes = await query(
      `SELECT MIN(joined_at) AS first_joined_at FROM chat_call_participants WHERE room_id = $1`,
      [room.id],
    );
    const firstJoinedAt = (firstJoinRes.rows[0] as { first_joined_at?: string | null } | undefined)?.first_joined_at || null;
    const publishState = participants.some((p) => Number(p.user_id) === Number(access.user_id)) ? "published" : "pending";
    const subscribeState = participants.length > 1 ? "subscribed" : "waiting_remote";
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
        connection_state: room.status === "active" ? "connected" : room.status === "scheduled" ? "connecting" : "idle",
        media_state: "ok",
        can_join: !isTerminal && isActiveLike,
        can_end: !isTerminal && (Number(room.created_by_user_id || 0) === Number(access.user_id) || meJoined),
        publish_state: publishState,
        subscribe_state: subscribeState,
        local_audio_track_present: publishState === "published",
        remote_audio_tracks_count: Math.max(0, participants.length - 1),
        autoplay_blocked: false,
        permission_state: "granted",
        device_state: "ready",
        timing_markers: {
          room_started_at: room.start_at,
          first_remote_joined_at: firstJoinedAt,
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { operation_status: "error", error: error instanceof Error ? error.message : "Failed to load call state." },
      { status: 500 },
    );
  }
}
