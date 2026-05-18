import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "ats-app",
      env: process.env.NODE_ENV || "development",
      version: process.env.npm_package_version || "0.0.0",
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
