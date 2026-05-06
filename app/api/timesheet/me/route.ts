import { NextResponse } from "next/server";
import { getTimesheetMe } from "@/lib/timesheet";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePermission("timesheet.view_self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const url = new URL(request.url);
    const entryDate = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const result = await getTimesheetMe(auth.access.user_id, entryDate);
    return NextResponse.json({ entry_date: entryDate, ...result });
  } catch (error) {
    console.error("GET /api/timesheet/me", error);
    return NextResponse.json({ error: "Failed to load timesheet." }, { status: 500 });
  }
}
