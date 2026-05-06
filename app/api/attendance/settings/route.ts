import { NextResponse } from "next/server";
import { getAttendanceSettings, updateAttendanceSettings } from "@/lib/attendance";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("attendance.view_self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const settings = await getAttendanceSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("GET /api/attendance/settings", error);
    return NextResponse.json({ error: "Failed to load attendance settings." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requirePermission("attendance.manage_all");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const settings = await updateAttendanceSettings({
      company_timezone: String(body.company_timezone || "Asia/Kolkata"),
      start_time_local: String(body.start_time_local || "09:30"),
      grace_minutes: Number(body.grace_minutes ?? 15),
      working_days: Array.isArray(body.working_days) ? body.working_days : [1, 2, 3, 4, 5],
      updated_by_user_id: auth.access.user_id,
    });

    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "attendance.settings_updated",
      metadata: settings,
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("PATCH /api/attendance/settings", error);
    return NextResponse.json({ error: "Failed to update attendance settings." }, { status: 500 });
  }
}
