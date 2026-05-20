import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { logCallEvent } from "@/lib/chatCallGovernance";

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
      const closeRes = await query(
        `UPDATE chat_call_rooms
         SET status = 'ended', ended_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status IN ('active', 'scheduled')
         RETURNING id`,
        [row.id],
      );
      if (!closeRes.rowCount) continue;
      closed += 1;
      await query(`UPDATE chat_call_participants SET left_at = NOW() WHERE room_id = $1 AND left_at IS NULL`, [row.id]);
      await query(
        `INSERT INTO messages (conversation_id, sender_id, content, is_system)
         VALUES ($1, NULL, $2, TRUE)`,
        [row.conversation_id, "call_ended: Call ended due to stale timeout"],
      );
      await logCallEvent({
        roomId: row.id,
        conversationId: row.conversation_id,
        eventType: "end",
        metadata: { reason: "timeout" },
        eventKey: `stale_end:${row.id}`,
      });
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
