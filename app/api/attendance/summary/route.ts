import { NextResponse } from "next/server";
import { getAttendanceSettings, getAttendanceSummary, getAttendanceTargetDates } from "@/lib/attendance";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePermission("attendance.view_self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const settings = await getAttendanceSettings();
    const url = new URL(request.url);
    const { today } = getAttendanceTargetDates(settings);
    const attendanceDate = url.searchParams.get("date") || today;
    const summary = await getAttendanceSummary(attendanceDate);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("GET /api/attendance/summary", error);
    return NextResponse.json({ error: "Failed to load attendance summary." }, { status: 500 });
  }
}
