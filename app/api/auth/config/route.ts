import { NextResponse } from "next/server";
import { isOpenSignupAllowed } from "@/lib/authSignupPolicy";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ allowOpenSignup: isOpenSignupAllowed() });
}
