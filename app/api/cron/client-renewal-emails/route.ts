import { NextResponse } from "next/server";
import { runClientRenewalEmails } from "@/lib/runClientRenewalEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST from an external scheduler (e.g. daily) with Authorization: Bearer <CRON_SECRET>.
 * In production, CRON_SECRET must be set. Same logic as `npm run client-renewal-emails-once`.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }

  try {
    const out = await runClientRenewalEmails();
    return NextResponse.json(out);
  } catch (e) {
    console.error("client-renewal-emails cron", e);
    return NextResponse.json({ error: "Failed to run renewal emails" }, { status: 500 });
  }
}
