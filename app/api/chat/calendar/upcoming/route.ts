import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 50) : 10;

    const rows = await query(
      `
      SELECT
        t.id,
        t.title,
        t.start_at,
        t.end_at,
        t.meet_link,
        t.status,
        conv.id AS conversation_id,
        conv.name AS conversation_name
      FROM team_calendar_events t
      JOIN LATERAL (
        SELECT CAST(substring(COALESCE(t.description, '') from '\\[chat-conversation:([0-9]+)\\]') AS int) AS cid
      ) marker ON marker.cid IS NOT NULL
      JOIN conversations conv ON conv.id = marker.cid
      JOIN conversation_members cm ON cm.conversation_id = conv.id AND cm.user_id = $1
      WHERE t.status <> 'cancelled'
        AND t.start_at >= NOW() - INTERVAL '2 hours'
      ORDER BY t.start_at ASC
      LIMIT $2
      `,
      [access.user_id, limit],
    );

    return NextResponse.json({ events: rows.rows });
  } catch (error) {
    console.error("chat/calendar/upcoming GET", error);
    return NextResponse.json({ error: "Failed to load upcoming chat calls." }, { status: 500 });
  }
}

