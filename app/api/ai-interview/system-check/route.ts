import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const interview = await requireCandidateInterview();
  if (!interview) return NextResponse.json({ error: "Interview session is invalid" }, { status: 401 });
  if (!["READY", "SCHEDULED", "IN_PROGRESS"].includes(String(interview.status))) {
    return NextResponse.json({ error: "System check is unavailable for this interview" }, { status: 409 });
  }
  const body = await request.json();
  const required = ["browser", "camera", "microphone", "speaker", "network"];
  if (interview.screen_share_enabled) required.push("screen");
  const failed = required.filter((key) => body?.checks?.[key] !== true);
  if (failed.length) return NextResponse.json({ error: `Complete required checks: ${failed.join(", ")}` }, { status: 400 });
  const dedupe = `system-check-${interview.id}-${crypto.randomUUID()}`;
  await query(
    `INSERT INTO ai_interview_events (interview_id,event_type,severity,occurred_at,metadata_json,deduplication_key)
     VALUES ($1,'SYSTEM_CHECK_PASSED','INFO',NOW(),$2::jsonb,$3)`,
    [interview.id, JSON.stringify({ checks: Object.fromEntries(required.map((key) => [key, true])), user_agent: request.headers.get("user-agent") }), dedupe]
  );
  return NextResponse.json({ passed: true, required });
}
