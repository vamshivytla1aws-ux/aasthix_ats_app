import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCareersPublisherUserId } from "@/lib/careersPublisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["view_job_list", "view_jd", "start_apply", "submit_success"]);

/**
 * Public funnel tracking (session id from client localStorage).
 */
export async function POST(request: Request) {
  try {
    const publisherId = getCareersPublisherUserId();
    if (publisherId == null) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const body = (await request.json().catch(() => ({}))) as {
      event_type?: string;
      job_id?: number | string | null;
      session_id?: string | null;
      meta?: Record<string, unknown>;
    };

    const eventType = String(body?.event_type || "").trim();
    if (!ALLOWED.has(eventType)) {
      return NextResponse.json({ error: "Invalid event_type" }, { status: 400 });
    }

    const jobIdRaw = body?.job_id;
    const jobId =
      jobIdRaw == null || jobIdRaw === ""
        ? null
        : Number(jobIdRaw);
    if (jobId != null && (!Number.isFinite(jobId) || jobId <= 0)) {
      return NextResponse.json({ error: "Invalid job_id" }, { status: 400 });
    }

    if (jobId != null) {
      const jobCheck = await query(
        `SELECT 1 FROM jobs WHERE id = $1 AND created_by_user_id = $2 LIMIT 1`,
        [jobId, publisherId]
      );
      if (jobCheck.rowCount === 0) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
    }

    const sessionId = String(body?.session_id || "").trim().slice(0, 128) || null;
    const metaJson =
      body?.meta && typeof body.meta === "object" && !Array.isArray(body.meta)
        ? JSON.stringify(body.meta)
        : "{}";

    await query(
      `
      INSERT INTO careers_funnel_events (publisher_user_id, job_id, event_type, session_id, meta)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [publisherId, jobId, eventType, sessionId, metaJson]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("careers/track POST", error);
    return NextResponse.json({ error: "Failed to record event" }, { status: 500 });
  }
}
