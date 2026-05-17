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

  await upsertShiftRule(
    {
      userId: Number(body.userId),
      shiftName: String(body.shiftName || "General"),
      startTime: String(body.startTime),
      endTime: String(body.endTime),
      lateGraceMinutes: Number(body.lateGraceMinutes ?? 15),
      earlyLogoutGraceMinutes: Number(body.earlyLogoutGraceMinutes ?? 15),
      halfDayMinutes: Number(body.halfDayMinutes ?? 240),
      overtimeAfterMinutes: Number(body.overtimeAfterMinutes ?? 480),
      wfhAllowed: Boolean(body.wfhAllowed),
    },
    auth.access.user_id,
  );
  return NextResponse.json({
    operation_status: "success",
    user_message: "Attendance rule saved.",
  });
}
