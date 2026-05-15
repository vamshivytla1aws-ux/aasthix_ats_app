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
    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "team_calendar.event_updated",
      metadata: { event_id: event.id, start_at: event.start_at, recurrence: event.recurrence },
    });
    return NextResponse.json({ event });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update team calendar event." },
      { status: 400 }
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
    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "team_calendar.event_cancelled",
      metadata: { event_id: event.id },
    });
    return NextResponse.json({ ok: true, event });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cancel team calendar event." },
      { status: 400 }
    );
  }
}
