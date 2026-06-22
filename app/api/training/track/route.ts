import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getTrainingPublisherUserId } from "@/lib/trainingPublisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const publisherId = getTrainingPublisherUserId();
    if (publisherId == null) {
      return NextResponse.json({ ok: false, configured: false }, { status: 200 });
    }

    const body = await request.json().catch(() => ({}));
    const eventType = String(body?.event_type || "").trim();
    if (!eventType) {
      return NextResponse.json({ error: "event_type is required" }, { status: 400 });
    }
    const sessionId = String(body?.session_id || "").trim().slice(0, 128) || null;
    const meta =
      body && typeof body.meta === "object" && body.meta && !Array.isArray(body.meta) ? JSON.stringify(body.meta) : "{}";

    await query(
      `
      INSERT INTO training_funnel_events (publisher_user_id, event_type, session_id, meta)
      VALUES ($1, $2, $3, $4::jsonb)
      `,
      [publisherId, eventType, sessionId, meta]
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("training/track POST", error);
    return NextResponse.json({ error: "Failed to track event" }, { status: 500 });
  }
}
