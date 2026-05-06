import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { getTimesheetSummary } from "@/lib/timesheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePermission("timesheet.view_self");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const url = new URL(request.url);
    const entryDate = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const summary = await getTimesheetSummary(entryDate);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("GET /api/timesheet/summary", error);
    return NextResponse.json({ error: "Failed to load timesheet summary." }, { status: 500 });
  }
}
