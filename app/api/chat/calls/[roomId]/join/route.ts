import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

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

    return NextResponse.json({ operation_status: "success", user_message: "Joined call room." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to join call room." }, { status: 400 });
  }
}
