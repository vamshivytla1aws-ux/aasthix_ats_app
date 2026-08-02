import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { testSharedGoogleCalendarConnection } from "@/lib/services/googleCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const gate = await requirePermission("settings.manage");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const result = await testSharedGoogleCalendarConnection();
  return NextResponse.json({ health: result }, { status: result.ok ? 200 : 503 });
}
