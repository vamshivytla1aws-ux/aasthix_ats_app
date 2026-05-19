import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { buildLiveKitRoomName } from "@/lib/livekit";

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
        ORDER BY id DESC
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
    return NextResponse.json({
      operation_status: "success",
      call: {
        ...room,
        room_name: buildLiveKitRoomName(conversationId, Number(room.id)),
        joined_count: participants.length,
        joined_participants: participants,
        is_active: room.status === "active" || room.status === "scheduled",
        status_kind: isPresenting || room.session_mode === "screenshare" ? "presenting" : "in_call",
        is_presenting: isPresenting,
        presenter_user_id: presenterUserId,
        room_closed_reason: roomClosedReason || null,
        connection_state: room.status === "active" ? "connected" : room.status === "scheduled" ? "connecting" : "idle",
        media_state: "ok",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { operation_status: "error", error: error instanceof Error ? error.message : "Failed to load call state." },
      { status: 500 },
    );
  }
}
