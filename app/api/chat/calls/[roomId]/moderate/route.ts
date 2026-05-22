import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { canModerateCall, logCallEvent } from "@/lib/chatCallGovernance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Action = "end_for_all" | "remove_participant" | "mute_participant" | "unmute_participant";

async function canTargetParticipant(conversationId: number, targetUserId: number) {
  if (!Number.isFinite(targetUserId) || targetUserId <= 0) return false;
  const targetRes = await query(
    `
    SELECT 1
    FROM users u
    JOIN conversation_members cm
      ON cm.user_id = u.id
    WHERE u.id = $1
      AND cm.conversation_id = $2
    LIMIT 1
    `,
    [targetUserId, conversationId],
  );
  return targetRes.rowCount > 0;
}

export async function POST(request: Request, { params }: { params: { roomId: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const roomId = Number(params.roomId);
    if (!Number.isFinite(roomId)) return NextResponse.json({ operation_status: "blocked", user_message: "Invalid room id." }, { status: 400 });

    const roomRes = await query(
      `SELECT id, conversation_id, status, created_by_user_id, title FROM chat_call_rooms WHERE id = $1 LIMIT 1`,
      [roomId],
    );
    const room = roomRes.rows[0] as { id: number; conversation_id: number; status: string; created_by_user_id: number | null; title: string } | undefined;
    if (!room) return NextResponse.json({ operation_status: "blocked", user_message: "Call room not found." }, { status: 404 });
    if (room.status === "ended" || room.status === "cancelled") {
      return NextResponse.json({
        operation_status: "success",
        user_message: "Call already ended.",
        room_status: "ended",
        is_active: false,
        can_join: false,
        can_end: false,
        connection_state: "idle",
        terminal_confirmed: true,
      });
    }
    const memberRes = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
      [room.conversation_id, access.user_id],
    );
    if (!memberRes.rowCount) return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });
    if (!canModerateCall(access, room.created_by_user_id)) {
      return NextResponse.json({ operation_status: "blocked", user_message: "Only host/admin/HR can moderate this call." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const requestKey = request.headers.get("x-idempotency-key")?.trim() || "";
    const action = String(body?.action || "") as Action;
    const targetUserId = Number(body?.target_user_id);

    if (action === "end_for_all") {
      if (requestKey) {
        const existing = await query(
          `SELECT 1 FROM chat_call_events WHERE room_id = $1 AND event_key = $2 LIMIT 1`,
          [roomId, requestKey],
        );
        if (existing.rowCount) {
          return NextResponse.json({ operation_status: "success", user_message: "Call already ended for all." });
        }
      }
      const endRes = await query(
        `
        WITH closed_room AS (
          UPDATE chat_call_rooms
          SET status = 'ended', ended_by_user_id = $2, ended_at = NOW(), updated_at = NOW()
          WHERE id = $1
            AND status IN ('active', 'scheduled')
          RETURNING id
        ),
        closed_participants AS (
          UPDATE chat_call_participants
          SET left_at = NOW()
          WHERE room_id = $1
            AND left_at IS NULL
          RETURNING user_id
        )
        SELECT (SELECT COUNT(*)::int FROM closed_room) AS room_closed
        `,
        [roomId, access.user_id],
      );
      const roomClosed = Number((endRes.rows[0] as { room_closed?: number } | undefined)?.room_closed || 0) > 0;
      if (!roomClosed) return NextResponse.json({ operation_status: "blocked", user_message: "Call already ended." }, { status: 409 });
      await query(`INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`, [
        room.conversation_id,
        access.user_id,
        "Call ended by moderator.",
      ]);
      await logCallEvent({
        roomId,
        conversationId: room.conversation_id,
        userId: access.user_id,
        eventType: "end",
        metadata: { reason: "moderator_end" },
        eventKey: requestKey || `moderator_end:${roomId}:${access.user_id}`,
      });
      return NextResponse.json({
        operation_status: "success",
        user_message: "Call ended for all.",
        room_status: "ended",
        is_active: false,
        can_join: false,
        can_end: false,
        connection_state: "idle",
      });
    }

    if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
      return NextResponse.json({ operation_status: "blocked", user_message: "Target participant is required." }, { status: 400 });
    }
    if (!(await canTargetParticipant(room.conversation_id, targetUserId))) {
      return NextResponse.json(
        {
          operation_status: "blocked",
          user_message: "Target participant is invalid or no longer in this conversation.",
        },
        { status: 409 },
      );
    }

    if (action === "remove_participant") {
      if (requestKey) {
        const existing = await query(
          `SELECT 1 FROM chat_call_events WHERE room_id = $1 AND event_key = $2 LIMIT 1`,
          [roomId, requestKey],
        );
        if (existing.rowCount) {
          return NextResponse.json({ operation_status: "success", user_message: "Participant already removed." });
        }
      }
      await query(
        `UPDATE chat_call_participants SET left_at = NOW() WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
        [roomId, targetUserId],
      );
      const existingRemoved = await query(
        `SELECT 1 FROM chat_call_removed_participants WHERE room_id = $1 AND user_id = $2 LIMIT 1`,
        [roomId, targetUserId],
      );
      if (existingRemoved.rowCount) {
        await query(
          `UPDATE chat_call_removed_participants SET removed_by_user_id = $3, created_at = NOW() WHERE room_id = $1 AND user_id = $2`,
          [roomId, targetUserId, access.user_id],
        );
      } else {
        await query(
          `INSERT INTO chat_call_removed_participants (room_id, user_id, removed_by_user_id) VALUES ($1, $2, $3)`,
          [roomId, targetUserId, access.user_id],
        );
      }
      await query(`INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`, [
        room.conversation_id,
        access.user_id,
        "Participant removed from call by moderator.",
      ]);
      try {
        await query(
          `INSERT INTO chat_call_signals (room_id, from_user_id, to_user_id, signal_type, payload)
           VALUES ($1, $2, $3, 'moderation_remove', '{}'::jsonb)`,
          [roomId, access.user_id, targetUserId],
        );
      } catch {
        // Avoid breaking moderator flow if target disappears between validation and signal insert.
      }
      await logCallEvent({
        roomId,
        conversationId: room.conversation_id,
        userId: access.user_id,
        eventType: "remove_participant",
        metadata: { target_user_id: targetUserId },
        eventKey: requestKey || `participant_removed:${roomId}:${targetUserId}:${access.user_id}`,
      });
      return NextResponse.json({ operation_status: "success", user_message: "Participant removed." });
    }

    if (action === "mute_participant" || action === "unmute_participant") {
      if (requestKey) {
        const existing = await query(
          `SELECT 1 FROM chat_call_events WHERE room_id = $1 AND event_key = $2 LIMIT 1`,
          [roomId, requestKey],
        );
        if (existing.rowCount) {
          return NextResponse.json({
            operation_status: "success",
            user_message: action === "mute_participant" ? "Participant already muted." : "Participant already unmuted.",
          });
        }
      }
      const muteFlag = action === "mute_participant";
      await query(
        `UPDATE chat_call_participants SET muted = $3 WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
        [roomId, targetUserId, muteFlag],
      );
      await query(
        `UPDATE chat_call_participants SET muted = FALSE WHERE room_id = $1 AND user_id = $2 AND left_at IS NOT NULL`,
        [roomId, targetUserId],
      );
      await query(`INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`, [
        room.conversation_id,
        access.user_id,
        muteFlag ? "Participant muted by moderator." : "Participant unmuted by moderator.",
      ]);
      try {
        await query(
          `INSERT INTO chat_call_signals (room_id, from_user_id, to_user_id, signal_type, payload)
           VALUES ($1, $2, $3, $4, '{}'::jsonb)`,
          [roomId, access.user_id, targetUserId, muteFlag ? "moderation_mute" : "moderation_unmute"],
        );
      } catch {
        // Avoid breaking moderator flow if target disappears between validation and signal insert.
      }
      await logCallEvent({
        roomId,
        conversationId: room.conversation_id,
        userId: access.user_id,
        eventType: muteFlag ? "mute_participant" : "unmute_participant",
        metadata: { target_user_id: targetUserId },
        eventKey:
          requestKey ||
          `${muteFlag ? "participant_muted" : "participant_unmuted"}:${roomId}:${targetUserId}:${access.user_id}`,
      });
      return NextResponse.json({
        operation_status: "success",
        user_message: muteFlag ? "Participant muted." : "Participant unmuted.",
      });
    }

    return NextResponse.json({ operation_status: "blocked", user_message: "Unsupported moderation action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ operation_status: "error", error: error instanceof Error ? error.message : "Failed to moderate call." }, { status: 500 });
  }
}
