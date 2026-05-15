import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import {
  deleteTimesheetEntry,
  getOrCreateTimesheetHeader,
  getTimesheetEntries,
  getTimesheetHeaderById,
  upsertTimesheetEntry,
} from "@/lib/timesheet";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireTimesheetSelfWrite() {
  const strict = await requirePermission("timesheet.manage_self");
  if (strict.ok) return strict;
  if (strict.status !== 403) return strict;
  const access = await getAuthAccess();
  if (!access) return strict;
  if (access.role === "admin" || access.permissions["timesheet.view_self"] === true) {
    return { ok: true as const, access };
  }
  return strict;
}

async function resolveHeaderForSelf(userId: number, entryDate: string) {
  return getOrCreateTimesheetHeader({ userId, entryDate, source: "self" });
}

async function canManageHeader(authUserId: number, headerId: number, allowAll: boolean) {
  const header = await getTimesheetHeaderById(headerId);
  if (!header) return null;
  if (allowAll || header.user_id === authUserId) return header;
  return null;
}

export async function GET(request: Request) {
  const authSelf = await requirePermission("timesheet.view_self");
  if (!authSelf.ok) return NextResponse.json({ error: authSelf.error }, { status: authSelf.status });

  try {
    const url = new URL(request.url);
    const entryDate = url.searchParams.get("date");
    const headerIdRaw = url.searchParams.get("header_id");
    const canViewAll = authSelf.access.role === "admin" || authSelf.access.permissions["timesheet.view_all"] === true;

    if (headerIdRaw) {
      const headerId = Number(headerIdRaw);
      if (!Number.isFinite(headerId)) return NextResponse.json({ error: "Invalid header_id." }, { status: 400 });
      const header = await getTimesheetHeaderById(headerId);
      if (!header) return NextResponse.json({ entries: [] });
      if (!canViewAll && header.user_id !== authSelf.access.user_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const entries = await getTimesheetEntries(header.id);
      return NextResponse.json({ header, entries });
    }

    const date = entryDate || new Date().toISOString().slice(0, 10);
    const header = await resolveHeaderForSelf(authSelf.access.user_id, date);
    const entries = header ? await getTimesheetEntries(header.id) : [];
    return NextResponse.json({ header, entries });
  } catch (error) {
    console.error("GET /api/timesheet/entries", error);
    return NextResponse.json({ error: "Failed to load timesheet entries." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireTimesheetSelfWrite();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const canManageAll = auth.access.role === "admin" || auth.access.permissions["timesheet.manage_all"] === true;
    let headerId = Number(body.header_id);
    if (!Number.isFinite(headerId)) {
      const date = String(body.entry_date || new Date().toISOString().slice(0, 10));
      const userId = canManageAll && Number.isFinite(Number(body.user_id)) ? Number(body.user_id) : auth.access.user_id;
      const header = await getOrCreateTimesheetHeader({ userId, entryDate: date, source: canManageAll ? "admin" : "self" });
      if (!header) throw new Error("Unable to initialize timesheet header.");
      headerId = header.id;
    }

    const ownerHeader = await canManageHeader(auth.access.user_id, headerId, canManageAll);
    if (!ownerHeader) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const entry = await upsertTimesheetEntry({
      headerId,
      ticketNumber: String(body.ticket_number || ""),
      taskTitle: String(body.task_title || ""),
      taskDescription: body.task_description ? String(body.task_description) : null,
      minutesSpent: Number(body.minutes_spent),
      workType: body.work_type ? String(body.work_type) : null,
      projectOrClient: body.project_or_client ? String(body.project_or_client) : null,
      source: canManageAll ? "admin" : "self",
    });

    const entries = await getTimesheetEntries(headerId);
    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "timesheet.entry_created",
      metadata: { header_id: headerId, ticket_number: entry?.ticket_number },
    });

    return NextResponse.json({
      entry,
      entries,
      operation_status: "success",
      user_message: "Timesheet entry added.",
      trace_id: `timesheet-entry-create-${Date.now()}`,
    });
  } catch (error) {
    console.error("POST /api/timesheet/entries", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create timesheet entry.",
        operation_status: "error",
        user_message: "Could not add timesheet entry.",
        hint: "Ticket number, task title, and minutes are required.",
        trace_id: `timesheet-entry-create-${Date.now()}`,
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireTimesheetSelfWrite();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const headerId = Number(body.header_id);
    const entryId = Number(body.entry_id);
    if (!Number.isFinite(headerId) || !Number.isFinite(entryId)) {
      return NextResponse.json({ error: "header_id and entry_id are required." }, { status: 400 });
    }
    const canManageAll = auth.access.role === "admin" || auth.access.permissions["timesheet.manage_all"] === true;
    const ownerHeader = await canManageHeader(auth.access.user_id, headerId, canManageAll);
    if (!ownerHeader) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const entry = await upsertTimesheetEntry({
      headerId,
      entryId,
      ticketNumber: String(body.ticket_number || ""),
      taskTitle: String(body.task_title || ""),
      taskDescription: body.task_description ? String(body.task_description) : null,
      minutesSpent: Number(body.minutes_spent),
      workType: body.work_type ? String(body.work_type) : null,
      projectOrClient: body.project_or_client ? String(body.project_or_client) : null,
      source: canManageAll ? "admin" : "self",
    });

    const entries = await getTimesheetEntries(headerId);
    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "timesheet.entry_updated",
      metadata: { header_id: headerId, entry_id: entryId },
    });
    return NextResponse.json({
      entry,
      entries,
      operation_status: "success",
      user_message: "Timesheet entry updated.",
      trace_id: `timesheet-entry-update-${Date.now()}`,
    });
  } catch (error) {
    console.error("PATCH /api/timesheet/entries", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update timesheet entry.",
        operation_status: "error",
        user_message: "Could not update timesheet entry.",
        hint: "Refresh and retry the row edit.",
        trace_id: `timesheet-entry-update-${Date.now()}`,
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireTimesheetSelfWrite();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const url = new URL(request.url);
    const headerId = Number(url.searchParams.get("header_id"));
    const entryId = Number(url.searchParams.get("entry_id"));
    if (!Number.isFinite(headerId) || !Number.isFinite(entryId)) {
      return NextResponse.json({ error: "header_id and entry_id are required." }, { status: 400 });
    }
    const canManageAll = auth.access.role === "admin" || auth.access.permissions["timesheet.manage_all"] === true;
    const ownerHeader = await canManageHeader(auth.access.user_id, headerId, canManageAll);
    if (!ownerHeader) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await deleteTimesheetEntry(headerId, entryId);
    const entries = await getTimesheetEntries(headerId);
    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "timesheet.entry_deleted",
      metadata: { header_id: headerId, entry_id: entryId },
    });
    return NextResponse.json({
      ok: true,
      entries,
      operation_status: "success",
      user_message: "Timesheet entry deleted.",
      trace_id: `timesheet-entry-delete-${Date.now()}`,
    });
  } catch (error) {
    console.error("DELETE /api/timesheet/entries", error);
    return NextResponse.json(
      {
        error: "Failed to delete timesheet entry.",
        operation_status: "error",
        user_message: "Could not delete timesheet entry.",
        hint: "Retry after refreshing the sheet.",
        trace_id: `timesheet-entry-delete-${Date.now()}`,
      },
      { status: 500 }
    );
  }
}
