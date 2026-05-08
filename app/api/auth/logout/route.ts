import { NextResponse } from "next/server";
import { tokenCookieName } from "@/lib/auth";

function buildExpiredCookieResponse(res: NextResponse) {
  res.cookies.set(tokenCookieName(), "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let redirectTo = url.searchParams.get("redirect_to");
  if (!redirectTo) {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await request.formData().catch(() => null);
      const fromForm = form?.get("redirect_to");
      redirectTo = fromForm ? String(fromForm) : null;
    }
  }

  if (redirectTo && redirectTo.startsWith("/")) {
    return buildExpiredCookieResponse(
      NextResponse.redirect(new URL(redirectTo, url.origin), { status: 303 })
    );
  }

  return buildExpiredCookieResponse(NextResponse.json({ ok: true }));
}

