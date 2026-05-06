import { NextResponse } from "next/server";
import { getAttendanceSettings, getAttendanceTargetDates, markAbsentForDate } from "@/lib/attendance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") || "";
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getAttendanceSettings();
    const body = await request.json().catch(() => ({}));
    const { yesterday } = getAttendanceTargetDates(settings);
    const targetDate = typeof body?.attendance_date === "string" && body.attendance_date ? body.attendance_date : yesterday;
    const result = await markAbsentForDate(targetDate, null);
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/cron/attendance-close-day", error);
    return NextResponse.json({ error: "Failed to process attendance close-day job." }, { status: 500 });
  }
}
