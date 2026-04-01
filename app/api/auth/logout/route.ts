import { NextResponse } from "next/server";
import { tokenCookieName } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(tokenCookieName(), "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

