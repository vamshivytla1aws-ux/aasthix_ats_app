import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { getChatCallPolicy, logCallEvent } from "@/lib/chatCallGovernance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { roomId: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const roomId = Number(params.roomId);
    if (!Number.isFinite(roomId)) return NextResponse.json({ error: "Invalid room id." }, { status: 400 });

    const roomRes = await query(`SELECT id, conversation_id, provider, status FROM chat_call_rooms WHERE id = $1 LIMIT 1`, [roomId]);
    const room = roomRes.rows[0] as { id: number; conversation_id: number; provider: string; status: string } | undefined;
    if (!room) return NextResponse.json({ error: "Call room not found." }, { status: 404 });
    if (room.provider !== "ats_native") return NextResponse.json({ error: "Unsupported call provider." }, { status: 400 });
    if (room.status === "ended" || room.status === "cancelled") {
      return NextResponse.json({ error: "This call is no longer active." }, { status: 409 });
    }

    const member = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 LIMIT 1`,
      [room.conversation_id, access.user_id],
    );
    if (!member.rowCount) return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });
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
    const policy = await getChatCallPolicy();
    const joinedCountRes = await query(
      `SELECT COUNT(*)::int AS count FROM chat_call_participants WHERE room_id = $1 AND left_at IS NULL`,
      [roomId],
    );
    const joinedCount = Number((joinedCountRes.rows[0] as { count: number } | undefined)?.count || 0);
    if (joinedCount >= policy.max_call_participants) {
      await logCallEvent({
        roomId,
        conversationId: room.conversation_id,
        userId: access.user_id,
        eventType: "join_fail",
        metadata: { reason: "max_participants", max: policy.max_call_participants },
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

    await query(
      `UPDATE chat_call_participants SET left_at = NOW() WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [roomId, access.user_id],
    );
    await query(
      `
      INSERT INTO chat_call_participants (room_id, user_id, joined_at, left_at)
      VALUES ($1, $2, NOW(), NULL)
      `,
      [roomId, access.user_id],
    );
    await query(
      `UPDATE chat_call_rooms SET status = 'active', updated_at = NOW() WHERE id = $1 AND status IN ('scheduled','active')`,
      [roomId],
    );
    await query(
      `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
      [room.conversation_id, access.user_id, "call_joined: Joined call"],
    );
    await logCallEvent({
      roomId,
      conversationId: room.conversation_id,
      userId: access.user_id,
      eventType: "join_success",
      eventKey: `join_success:${roomId}:${access.user_id}:${Date.now()}`,
    });
    await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [room.conversation_id]);

    return NextResponse.json({ operation_status: "success", user_message: "Joined call room." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to join call room." }, { status: 400 });
  }
}
