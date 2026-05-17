import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { addHoliday, listHolidays } from "@/lib/leave";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("leave.view_self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const holidays = await listHolidays();
    return NextResponse.json({ holidays });
  } catch (error) {
    console.error("GET /api/leave/holidays", error);
    return NextResponse.json({ error: "Failed to load holidays." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requirePermission("leave.manage_policy");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = (await request.json().catch(() => null)) as
      | { holiday_date?: string; holiday_name?: string; location_scope?: string | null }
      | null;
    if (!body) return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
    const holiday = await addHoliday(
      auth.access.user_id,
      String(body.holiday_date || ""),
      String(body.holiday_name || ""),
      body.location_scope || null,
    );
    return NextResponse.json({
      holiday,
      operation_status: "success",
      user_message: "Holiday saved.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save holiday.",
        operation_status: "error",
        user_message: "Holiday could not be saved.",
      },
      { status: 400 },
    );
  }
}
