import { NextResponse } from "next/server";
import { getAuthAccess } from "@/lib/rbac";
import { disconnectSharedGoogleConnection } from "@/lib/services/googleCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (String(access.role || "").toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    await disconnectSharedGoogleConnection();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("calendar/google/disconnect", error);
    return NextResponse.json({ error: "Failed to disconnect Google Calendar" }, { status: 500 });
  }
}
