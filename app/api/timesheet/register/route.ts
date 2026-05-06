import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { getTimesheetEntries, getTimesheetHeaderById, getTimesheetRegister, updateTimesheetHeader } from "@/lib/timesheet";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePermission("timesheet.view_all");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const url = new URL(request.url);
    const entryDate = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const role = url.searchParams.get("role") || "all";
    const q = url.searchParams.get("q");
    const ticket = url.searchParams.get("ticket");
    const userIdRaw = url.searchParams.get("user_id");
    const headerIdRaw = url.searchParams.get("header_id");
    const userId = userIdRaw ? Number(userIdRaw) : null;

    if (headerIdRaw) {
      const headerId = Number(headerIdRaw);
      if (!Number.isFinite(headerId)) return NextResponse.json({ error: "Invalid header_id." }, { status: 400 });
      const header = await getTimesheetHeaderById(headerId);
      if (!header) return NextResponse.json({ header: null, entries: [] });
      const entries = await getTimesheetEntries(headerId);
      return NextResponse.json({ header, entries });
    }

    const rows = await getTimesheetRegister({
      entryDate,
      role,
      userId: Number.isFinite(userId) ? userId : null,
      q,
      ticket,
    });
    return NextResponse.json({ rows, entry_date: entryDate });
  } catch (error) {
    console.error("GET /api/timesheet/register", error);
    return NextResponse.json({ error: "Failed to load timesheet register." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requirePermission("timesheet.manage_all");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const userId = Number(body.user_id);
    const entryDate = String(body.entry_date || "");
    if (!Number.isFinite(userId) || !entryDate) {
      return NextResponse.json({ error: "user_id and entry_date are required." }, { status: 400 });
    }

    const header = await updateTimesheetHeader({
      userId,
      entryDate,
      notes: body.notes == null ? undefined : String(body.notes || ""),
      status: body.status === "submitted" ? "submitted" : "draft",
      source: "admin",
    });

    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "timesheet.register_updated",
      metadata: { user_id: userId, entry_date: entryDate, status: header?.status },
    });

    return NextResponse.json({ header });
  } catch (error) {
    console.error("PATCH /api/timesheet/register", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update timesheet register row." }, { status: 500 });
  }
}
