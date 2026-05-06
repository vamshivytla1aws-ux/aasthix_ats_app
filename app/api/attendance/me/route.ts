import { NextResponse } from "next/server";
import { getAttendanceRecentForUser, getAttendanceSummary, getTodayAttendanceForUser } from "@/lib/attendance";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("attendance.view_self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { settings, today, record } = await getTodayAttendanceForUser(auth.access.user_id);
    const recent_records = await getAttendanceRecentForUser(auth.access.user_id, 14);
    const summary = await getAttendanceSummary(today);
    return NextResponse.json({
      today,
      settings,
      record,
      active_session: Boolean(record?.first_check_in_at && !record?.last_check_out_at),
      recent_records,
      daily_summary: summary,
    });
  } catch (error) {
    console.error("GET /api/attendance/me", error);
    return NextResponse.json({ error: "Failed to load your attendance." }, { status: 500 });
  }
}
