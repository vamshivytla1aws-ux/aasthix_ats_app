import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { disconnectSharedGoogleConnection } from "@/lib/services/googleCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const gate = await requirePermission("settings.manage");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    await disconnectSharedGoogleConnection();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("calendar/google/disconnect", error);
    return NextResponse.json({ error: "Failed to disconnect Google Calendar" }, { status: 500 });
  }
}
