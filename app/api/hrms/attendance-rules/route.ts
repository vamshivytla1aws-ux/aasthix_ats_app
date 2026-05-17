import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { listShiftRules, upsertShiftRule } from "@/lib/hrms/attendanceRules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    access.role !== "admin" &&
    !access.permissions["attendance_rules.manage"] &&
    !access.permissions["attendance.view_all"] &&
    !access.permissions["attendance.view_self"]
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(request.url);
  const userId = Number(url.searchParams.get("userId") || 0);
  const rules = await listShiftRules(access.user_id, access.role, Number.isFinite(userId) && userId > 0 ? userId : undefined);
  return NextResponse.json({ rules });
}

export async function PUT(request: Request) {
  const auth = await requirePermission("attendance_rules.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as
    | {
        userId?: number;
        shiftName?: string;
        startTime?: string;
        endTime?: string;
        lateGraceMinutes?: number;
        earlyLogoutGraceMinutes?: number;
        halfDayMinutes?: number;
        overtimeAfterMinutes?: number;
        wfhAllowed?: boolean;
      }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  if (!Number(body.userId)) return NextResponse.json({ error: "User is required." }, { status: 400 });
  if (!body.startTime || !body.endTime) return NextResponse.json({ error: "Shift start/end times are required." }, { status: 400 });
  const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timePattern.test(String(body.startTime)) || !timePattern.test(String(body.endTime))) {
    return NextResponse.json({ error: "Shift times must be in HH:mm format." }, { status: 400 });
  }
  const [startHour, startMin] = String(body.startTime).split(":").map(Number);
  const [endHour, endMin] = String(body.endTime).split(":").map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  if (startMinutes >= endMinutes) {
    return NextResponse.json({ error: "Shift end time must be later than shift start time." }, { status: 400 });
  }
  const lateGraceMinutes = Number(body.lateGraceMinutes ?? 15);
  const earlyLogoutGraceMinutes = Number(body.earlyLogoutGraceMinutes ?? 15);
  const halfDayMinutes = Number(body.halfDayMinutes ?? 240);
  const overtimeAfterMinutes = Number(body.overtimeAfterMinutes ?? 480);
  if (!Number.isFinite(lateGraceMinutes) || lateGraceMinutes < 0 || lateGraceMinutes > 240) {
    return NextResponse.json({ error: "Late grace must be between 0 and 240 minutes." }, { status: 400 });
  }
  if (!Number.isFinite(earlyLogoutGraceMinutes) || earlyLogoutGraceMinutes < 0 || earlyLogoutGraceMinutes > 240) {
    return NextResponse.json({ error: "Early logout grace must be between 0 and 240 minutes." }, { status: 400 });
  }
  if (!Number.isFinite(halfDayMinutes) || halfDayMinutes < 0 || halfDayMinutes > 720) {
    return NextResponse.json({ error: "Half-day threshold must be between 0 and 720 minutes." }, { status: 400 });
  }
  if (!Number.isFinite(overtimeAfterMinutes) || overtimeAfterMinutes < 0 || overtimeAfterMinutes > 960) {
    return NextResponse.json({ error: "Overtime start threshold must be between 0 and 960 minutes." }, { status: 400 });
  }

  await upsertShiftRule(
    {
      userId: Number(body.userId),
      shiftName: String(body.shiftName || "General"),
      startTime: String(body.startTime),
      endTime: String(body.endTime),
      lateGraceMinutes,
      earlyLogoutGraceMinutes,
      halfDayMinutes,
      overtimeAfterMinutes,
      wfhAllowed: Boolean(body.wfhAllowed),
    },
    auth.access.user_id,
  );
  return NextResponse.json({
    operation_status: "success",
    user_message: "Attendance rule saved.",
  });
}
