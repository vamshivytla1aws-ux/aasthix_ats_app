import { NextRequest, NextResponse } from "next/server";
import { tokenCookieName } from "@/lib/auth";

const PUBLIC_FILE_REGEX = /\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|woff|woff2|ttf|otf)$/i;

const PUBLIC_PATHS = new Set([
  "/login",
  "/signup",
  "/invite/accept",
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/me",
  "/api/auth/config",
  "/api/auth/accept-invite",
]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublicFile = PUBLIC_FILE_REGEX.test(pathname);
  const shouldNoIndex =
    !pathname.startsWith("/api") &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/favicon") &&
    !pathname.startsWith("/assets") &&
    !isPublicFile &&
    !pathname.startsWith("/careers") &&
    !pathname.startsWith("/training") &&
    !pathname.startsWith("/ai-interview");

  // Never redirect API routes: APIs must return JSON (e.g. 401) themselves.
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Allow Next.js internals and static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets") ||
    isPublicFile
  ) {
    return NextResponse.next();
  }

  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/careers") ||
    pathname.startsWith("/training") ||
    pathname.startsWith("/ai-interview") ||
    pathname.startsWith("/chat/external/")
  ) {
    const res = NextResponse.next();
    if (shouldNoIndex) {
      res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    }
    return res;
  }

  const token = req.cookies.get(tokenCookieName())?.value;
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Middleware runs on the Edge runtime. To avoid Edge-incompatible crypto deps,
  // we only check presence of the auth cookie here. APIs still enforce auth.
  const res = NextResponse.next();
  if (shouldNoIndex) {
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
