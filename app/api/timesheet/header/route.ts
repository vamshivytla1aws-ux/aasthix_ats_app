import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { getTimesheetHeaderById, updateTimesheetHeader } from "@/lib/timesheet";
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

export async function POST(request: Request) {
  const auth = await requireTimesheetSelfWrite();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const entryDate = String(body.entry_date || new Date().toISOString().slice(0, 10));
    const header = await updateTimesheetHeader({
      userId: auth.access.user_id,
      entryDate,
      notes: body.notes == null ? undefined : String(body.notes || ""),
      status: body.status === "submitted" ? "submitted" : "draft",
      source: "self",
    });

    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "timesheet.header_updated",
      metadata: { entry_date: entryDate, status: header?.status },
    });

    return NextResponse.json({ header });
  } catch (error) {
    console.error("POST /api/timesheet/header", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update timesheet header." }, { status: 500 });
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
      action: "timesheet.header_admin_updated",
      metadata: { user_id: userId, entry_date: entryDate, status: header?.status },
    });

    return NextResponse.json({ header });
  } catch (error) {
    console.error("PATCH /api/timesheet/header", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update timesheet header." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const auth = await requirePermission("timesheet.view_all");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const url = new URL(request.url);
    const headerId = Number(url.searchParams.get("header_id"));
    if (!Number.isFinite(headerId)) return NextResponse.json({ error: "header_id is required." }, { status: 400 });
    const header = await getTimesheetHeaderById(headerId);
    return NextResponse.json({ header });
  } catch (error) {
    console.error("GET /api/timesheet/header", error);
    return NextResponse.json({ error: "Failed to load timesheet header." }, { status: 500 });
  }
}
