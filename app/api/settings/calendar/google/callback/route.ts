import { NextResponse } from "next/server";
import { getAuthAccess } from "@/lib/rbac";
import { buildPublicUrl } from "@/lib/publicUrl";
import { completeGoogleOAuth } from "@/lib/services/googleCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToSettings(message: string) {
  const url = new URL(buildPublicUrl("/settings"));
  url.searchParams.set("calendar", message);
  return url;
}

export async function GET(request: Request) {
  const access = await getAuthAccess();
  if (!access) return NextResponse.redirect(redirectToSettings("unauthorized"));
  if (!access.permissions["settings.manage"]) {
    return NextResponse.redirect(redirectToSettings("forbidden"));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("google_calendar_oauth_state="))
    ?.split("=")[1];

  const response = NextResponse.redirect(redirectToSettings("connected"));
  response.cookies.set("google_calendar_oauth_state", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  });

  if (!code || !state || !cookie) {
    return NextResponse.redirect(redirectToSettings("missing_auth_state"));
  }

  const decoded = decodeURIComponent(cookie);
  const [cookieUserId, cookieState] = decoded.split(":");
  if (cookieState !== state || Number(cookieUserId) !== Number(access.user_id)) {
    return NextResponse.redirect(redirectToSettings("invalid_auth_state"));
  }

  try {
    await completeGoogleOAuth({ code, userId: Number(access.user_id) });
    return response;
  } catch (error) {
    console.error("calendar/google/callback", error);
    return NextResponse.redirect(redirectToSettings("connect_failed"));
  }
}
