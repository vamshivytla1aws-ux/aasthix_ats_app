import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { closeChatCallRoomTransactional } from "@/lib/chatCalls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const staleRes = await query(
      `
      SELECT r.id, r.conversation_id
      FROM chat_call_rooms r
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS active_count
        FROM chat_call_participants p
        WHERE p.room_id = r.id AND p.left_at IS NULL
      ) c ON TRUE
      WHERE r.status IN ('active', 'scheduled')
        AND (
          r.end_at < NOW() - INTERVAL '5 minutes'
          OR (r.status = 'active' AND COALESCE(c.active_count, 0) = 0 AND r.start_at < NOW() - INTERVAL '60 seconds')
        )
      LIMIT 200
      `,
    );
    let closed = 0;
    for (const row of staleRes.rows as Array<{ id: number; conversation_id: number }>) {
      const result = await closeChatCallRoomTransactional({
        roomId: row.id,
        conversationId: row.conversation_id,
        endedByUserId: null,
        reason: "timeout",
        systemMessage: "Call ended due to stale timeout.",
        messageSenderId: null,
        eventUserId: null,
        eventKey: `stale_end:${row.id}`,
      });
      if (!result.closed) continue;
      closed += 1;
    }

    return NextResponse.json({
      operation_status: "success",
      user_message: `Closed ${closed} stale call room(s).`,
      closed,
    });
  } catch (error) {
    return NextResponse.json({ operation_status: "error", error: error instanceof Error ? error.message : "Failed to cleanup stale calls." }, { status: 500 });
  }
}
