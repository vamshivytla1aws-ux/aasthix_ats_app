import { NextResponse } from "next/server";
import {
  adminUpsertAttendance,
  getAttendanceRegister,
  getAttendanceSettings,
  getAttendanceTargetDates,
  markAbsentForDate,
  updateUserAttendanceShift,
} from "@/lib/attendance";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePermission("attendance.view_all");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const settings = await getAttendanceSettings();
    const url = new URL(request.url);
    const { today } = getAttendanceTargetDates(settings);
    const attendanceDate = url.searchParams.get("date") || today;
    const status = (url.searchParams.get("status") || "all") as "present" | "late" | "absent" | "not_checked_in" | "all";
    const role = url.searchParams.get("role") || "all";
    const q = url.searchParams.get("q");
    const userIdRaw = url.searchParams.get("user_id");
    const userId = userIdRaw ? Number(userIdRaw) : null;

    const rows = await getAttendanceRegister({
      attendanceDate,
      status,
      role,
      userId: Number.isFinite(userId) ? userId : null,
      q,
    });

    return NextResponse.json({ rows, attendance_date: attendanceDate, settings });
  } catch (error) {
    console.error("GET /api/attendance/register", error);
    return NextResponse.json({ error: "Failed to load attendance register." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requirePermission("attendance.manage_all");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    if (body.action === "mark_absent_for_date") {
      const result = await markAbsentForDate(String(body.attendance_date), auth.access.user_id);
      await writeAuditLog({
        actorUserId: auth.access.user_id,
        action: "attendance.absent_marked",
        metadata: result,
      });
      return NextResponse.json({
        ...result,
        operation_status: "success",
        user_message: "Absent statuses processed for the selected date.",
        trace_id: `attendance-absent-${Date.now()}`,
      });
    }
    if (body.action === "update_shift") {
      const userId = Number(body.user_id);
      if (!Number.isFinite(userId)) {
        return NextResponse.json({ error: "user_id is required." }, { status: 400 });
      }
      const shift = await updateUserAttendanceShift({
        userId,
        startTimeLocal: body.shift_start_time_local == null ? null : String(body.shift_start_time_local || ""),
        graceMinutes: body.shift_grace_minutes == null ? null : Number(body.shift_grace_minutes),
      });
      await writeAuditLog({
        actorUserId: auth.access.user_id,
        action: "attendance.shift_updated",
        metadata: { user_id: userId, shift },
      });
      return NextResponse.json({
        shift,
        operation_status: "success",
        user_message: "Shift timing updated.",
        hint: "Future late/absent calculation will use this setting.",
        trace_id: `attendance-shift-${Date.now()}`,
      });
    }

    const record = await adminUpsertAttendance({
      userId: Number(body.user_id),
      attendanceDate: String(body.attendance_date),
      status: String(body.status) as "present" | "late" | "absent",
      firstCheckInAt: body.first_check_in_at ? String(body.first_check_in_at) : null,
      lastCheckOutAt: body.last_check_out_at ? String(body.last_check_out_at) : null,
      adminNote: body.admin_note ? String(body.admin_note) : null,
    });

    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "attendance.record_updated",
      metadata: {
        user_id: body.user_id,
        attendance_date: body.attendance_date,
        status: record?.status,
      },
    });

    return NextResponse.json({
      record,
      operation_status: "success",
      user_message: "Attendance record updated.",
      trace_id: `attendance-record-${Date.now()}`,
    });
  } catch (error) {
    console.error("PATCH /api/attendance/register", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update attendance record.",
        operation_status: "error",
        user_message: "Attendance update failed.",
        hint: "Verify date/time values and retry.",
        trace_id: `attendance-record-${Date.now()}`,
      },
      { status: 500 }
    );
  }
}
