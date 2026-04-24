import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthAccess } from "@/lib/rbac";
import { buildGoogleConnectUrl } from "@/lib/services/googleCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function forbidden() {
  return NextResponse.json({ error: "Admin access required" }, { status: 403 });
}

export async function POST() {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (String(access.role || "").toLowerCase() !== "admin") return forbidden();

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
