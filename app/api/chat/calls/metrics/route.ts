import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const windowRes = await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE event_type = 'join_success')::int AS join_success,
              COUNT(*) FILTER (WHERE event_type = 'join_fail')::int AS join_fail,
              COUNT(*) FILTER (WHERE event_type = 'drop')::int AS drops,
              COUNT(*) FILTER (WHERE event_type = 'reconnect')::int AS reconnects,
              COUNT(*) FILTER (WHERE event_type = 'media_fail')::int AS media_fails,
              COUNT(*) FILTER (WHERE event_type = 'join_fail' AND COALESCE(metadata->>'reason','') ILIKE '%one_way_audio%')::int AS one_way_audio_incidents
       FROM chat_call_events
       WHERE created_at >= NOW() - INTERVAL '30 days'`,
    );
    const row = windowRes.rows[0] as {
      total: number; join_success: number; join_fail: number; drops: number; reconnects: number; media_fails: number; one_way_audio_incidents: number;
    };
    const durationRes = await query(
      `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (COALESCE(ended_at, end_at) - start_at))) AS median_seconds
       FROM chat_call_rooms
       WHERE start_at >= NOW() - INTERVAL '30 days'`,
    );
    const participantRes = await query(
      `SELECT AVG(joined_count)::numeric(10,2) AS avg_participants
       FROM (
         SELECT room_id, COUNT(*)::int AS joined_count
         FROM chat_call_participants
         GROUP BY room_id
       ) t`,
    );
    const joinAttempts = Number(row.join_success || 0) + Number(row.join_fail || 0);
    const joinSuccessRate = joinAttempts > 0 ? Number(row.join_success || 0) / joinAttempts : 1;

    return NextResponse.json({
      operation_status: "success",
      metrics: {
        window_days: 30,
        total_events: Number(row.total || 0),
        join_success_rate: Number(joinSuccessRate.toFixed(4)),
        drop_rate: joinAttempts > 0 ? Number((Number(row.drops || 0) / joinAttempts).toFixed(4)) : 0,
        avg_reconnects_per_attempt: joinAttempts > 0 ? Number((Number(row.reconnects || 0) / joinAttempts).toFixed(4)) : 0,
        one_way_audio_incident_rate: joinAttempts > 0 ? Number((Number(row.one_way_audio_incidents || 0) / joinAttempts).toFixed(4)) : 0,
        media_fail_rate: joinAttempts > 0 ? Number((Number(row.media_fails || 0) / joinAttempts).toFixed(4)) : 0,
        median_call_duration_seconds: Number((durationRes.rows[0] as { median_seconds: number | null } | undefined)?.median_seconds || 0),
        avg_participants: Number((participantRes.rows[0] as { avg_participants: number | null } | undefined)?.avg_participants || 0),
      },
    });
  } catch (error) {
    return NextResponse.json({ operation_status: "error", error: error instanceof Error ? error.message : "Failed to load call metrics." }, { status: 500 });
  }
}
