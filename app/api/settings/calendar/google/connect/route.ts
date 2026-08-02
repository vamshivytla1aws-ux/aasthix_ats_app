import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { buildGoogleConnectUrl } from "@/lib/services/googleCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const gate = await requirePermission("settings.manage");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const access = gate.access;

  const state = crypto.randomUUID();
  const authUrl = buildGoogleConnectUrl(state);
  const response = NextResponse.json({ authUrl });
  response.cookies.set("google_calendar_oauth_state", `${access.user_id}:${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
    path: "/",
  });
  return response;
}
