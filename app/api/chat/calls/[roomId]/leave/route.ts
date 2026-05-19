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

    await query(
      `
      UPDATE chat_call_participants
      SET left_at = NOW()
      WHERE room_id = $1
        AND user_id = $2
        AND left_at IS NULL
      `,
      [roomId, access.user_id],
    );

    const openParticipants = await query(
      `SELECT 1 FROM chat_call_participants WHERE room_id = $1 AND left_at IS NULL LIMIT 1`,
      [roomId],
    );
    if (!openParticipants.rowCount) {
      await query(
        `UPDATE chat_call_rooms SET status = 'ended', ended_at = NOW(), updated_at = NOW() WHERE id = $1 AND status <> 'ended'`,
        [roomId],
      );
    }

    return NextResponse.json({ operation_status: "success", user_message: "Left call room." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to leave call room." }, { status: 400 });
  }
}

