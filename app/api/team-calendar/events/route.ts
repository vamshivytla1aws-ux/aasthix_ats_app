import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { createTeamCalendarEvent, listTeamCalendarEvents } from "@/lib/teamCalendar";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePermission("team_calendar.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const q = url.searchParams.get("q");
    const events = await listTeamCalendarEvents({ from, to, q });
    return NextResponse.json({ events });
  } catch (error) {
    console.error("GET /api/team-calendar/events", error);
    return NextResponse.json({ error: "Failed to load team calendar events." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requirePermission("team_calendar.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const event = await createTeamCalendarEvent(auth.access.user_id, body || {});
    const traceId = `teamcal-create-${Date.now()}`;
    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "team_calendar.event_created",
      metadata: {
        event_id: event.id,
        start_at: event.start_at,
        recurrence: event.recurrence,
        trace_id: traceId,
      },
    });
    return NextResponse.json({
      event,
      operation_status: "success",
      user_message: "Meeting scheduled and invite synced.",
      hint: "Attendees should receive a calendar invite shortly.",
      trace_id: traceId,
    });
  } catch (error) {
    const traceId = `teamcal-create-${Date.now()}`;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create team calendar event.",
        operation_status: "error",
        user_message: "Meeting could not be created.",
        hint: "Check attendee emails and calendar connection.",
        trace_id: traceId,
      },
      { status: 400 },
    );
  }
}
