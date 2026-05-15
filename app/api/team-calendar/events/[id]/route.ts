import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { cancelTeamCalendarEvent, updateTeamCalendarEvent } from "@/lib/teamCalendar";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const auth = await requirePermission("team_calendar.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = parseId(context.params.id);
  if (!id) return NextResponse.json({ error: "Invalid event id." }, { status: 400 });

  try {
    const body = await request.json();
    const event = await updateTeamCalendarEvent(auth.access.user_id, id, body || {});
    const traceId = `teamcal-update-${id}-${Date.now()}`;
    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "team_calendar.event_updated",
      metadata: { event_id: event.id, start_at: event.start_at, recurrence: event.recurrence, trace_id: traceId },
    });
    return NextResponse.json({
      event,
      operation_status: "success",
      user_message: "Meeting updated and invite re-synced.",
      hint: "Attendees will receive updated invite details.",
      trace_id: traceId,
    });
  } catch (error) {
    const traceId = `teamcal-update-${id}-${Date.now()}`;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update team calendar event.",
        operation_status: "error",
        user_message: "Meeting could not be updated.",
        hint: "Verify calendar scope/connection and retry.",
        trace_id: traceId,
      },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const auth = await requirePermission("team_calendar.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = parseId(context.params.id);
  if (!id) return NextResponse.json({ error: "Invalid event id." }, { status: 400 });

  try {
    const event = await cancelTeamCalendarEvent(auth.access.user_id, id);
    const traceId = `teamcal-cancel-${id}-${Date.now()}`;
    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "team_calendar.event_cancelled",
      metadata: { event_id: event.id, trace_id: traceId },
    });
    return NextResponse.json({
      ok: true,
      event,
      operation_status: "success",
      user_message: "Meeting cancelled and attendees notified.",
      trace_id: traceId,
    });
  } catch (error) {
    const traceId = `teamcal-cancel-${id}-${Date.now()}`;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to cancel team calendar event.",
        operation_status: "error",
        user_message: "Meeting cancellation failed.",
        hint: "Check organizer permissions and calendar connectivity.",
        trace_id: traceId,
      },
      { status: 400 },
    );
  }
}
