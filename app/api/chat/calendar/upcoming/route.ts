import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { listUserUpcomingAndRecentCalls } from "@/lib/chatCalls";

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

    const result = await listUserUpcomingAndRecentCalls(access.user_id, limit);

    const events = result.upcoming.map((row) => ({
      id: row.id,
      title: row.title,
      start_at: row.start_at,
      end_at: row.end_at,
      meet_link: row.join_url,
      join_url: row.join_url,
      status: row.status,
      conversation_id: row.conversation_id,
      conversation_name: row.conversation_name,
      provider: row.provider,
      session_mode: row.mode,
    }));

    const recent_events = result.recent.map((row) => ({
      id: row.id,
      title: row.title,
      start_at: row.start_at,
      end_at: row.end_at,
      meet_link: row.join_url,
      join_url: row.join_url,
      status: row.status,
      conversation_id: row.conversation_id,
      conversation_name: row.conversation_name,
      provider: row.provider,
      session_mode: row.mode,
    }));

    return NextResponse.json({ events, recent_events });
  } catch (error) {
    console.error("chat/calendar/upcoming GET", error);
    return NextResponse.json({ error: "Failed to load upcoming chat calls." }, { status: 500 });
  }
}

