import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { roomId: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
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
    const recentErrors = (eventsRes.rows as Array<{ event_type: string; metadata: unknown; created_at: string }>)
      .filter((e) => e.event_type.includes("fail") || e.event_type.includes("blocked"))
      .slice(0, 8);
    const closeReasonRow = (eventsRes.rows as Array<{ event_type: string; metadata?: { reason?: string } }>)
      .find((row) => row.event_type === "end");
    const roomClosedReason = String(closeReasonRow?.metadata?.reason || "");
    const localInRoom = activeParticipants.some((p) => Number(p.user_id) === Number(access.user_id));
    const firstJoinRes = await query(
      `SELECT MIN(joined_at) AS first_joined_at FROM chat_call_participants WHERE room_id = $1`,
      [roomId],
    );
    const firstJoinedAt = (firstJoinRes.rows[0] as { first_joined_at?: string | null } | undefined)?.first_joined_at || null;

    return NextResponse.json({
      operation_status: "success",
      diagnostics: {
        room: {
          ...room,
          joined_count: activeParticipants.length,
          joined_participants: activeParticipants,
          room_closed_reason: roomClosedReason || null,
          connection_state: room.status === "active" ? "connected" : room.status === "scheduled" ? "connecting" : "idle",
          media_state: "ok",
          is_active: room.status === "active" || room.status === "scheduled",
          can_join: room.status === "active" || room.status === "scheduled",
          can_end:
            room.status === "active" || room.status === "scheduled"
              ? (Number(room.created_by_user_id || 0) === Number(access.user_id) || activeParticipants.some((p) => Number(p.user_id) === Number(access.user_id)))
              : false,
          publish_state: localInRoom ? "published" : "pending",
          subscribe_state: activeParticipants.length > 1 ? "subscribed" : "waiting_remote",
          local_audio_track_present: localInRoom,
          remote_audio_tracks_count: Math.max(0, activeParticipants.length - 1),
          autoplay_blocked: false,
          permission_state: "granted",
          device_state: "ready",
          timing_markers: {
            room_started_at: room.start_at,
            first_remote_joined_at: firstJoinedAt,
          },
        },
        participants: participantsRes.rows,
        recent_events: eventsRes.rows,
        recent_errors: recentErrors,
      },
    });
  } catch (error) {
    return NextResponse.json({ operation_status: "error", error: error instanceof Error ? error.message : "Failed to fetch call diagnostics." }, { status: 500 });
  }
}
