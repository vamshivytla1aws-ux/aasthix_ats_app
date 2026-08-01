import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";
import { INTEGRITY_EVENT_TYPES } from "@/lib/aiInterviews/types";

export const runtime = "nodejs";

const HIGH_EVENTS = new Set(["MULTIPLE_FACES","CAMERA_DISABLED","MICROPHONE_DISABLED","RECORDING_INTERRUPTED"]);

export async function POST(request: Request) {
  const interview = await requireCandidateInterview();
  if (!interview) return NextResponse.json({ error: "Interview session is invalid" }, { status: 401 });
  const body = await request.json();
  const items = Array.isArray(body?.events) ? body.events.slice(0,50) : [body];
  let accepted = 0;
  for (const item of items) {
    const type = String(item?.event_type||"").toUpperCase();
    if (!INTEGRITY_EVENT_TYPES.has(type)) continue;
    const occurred = new Date(String(item?.occurred_at||new Date().toISOString()));
    if (!Number.isFinite(occurred.getTime()) || Math.abs(Date.now()-occurred.getTime()) > 10*60*1000) continue;
    const count = await query(`SELECT COUNT(*)::int AS count FROM ai_interview_events WHERE interview_id=$1 AND event_type=$2`, [interview.id,type]);
    const warningNumber = Number(count.rows[0]?.count||0)+1;
    const threshold = type==="TAB_HIDDEN" ? Number(interview.tab_switch_warning_limit) : type==="LOOKING_AWAY" ? Number(interview.look_away_warning_limit) : 1;
    const severity = HIGH_EVENTS.has(type) || warningNumber>threshold ? "REVIEW" : warningNumber===threshold ? "WARNING" : "INFO";
    const dedupe = String(item?.deduplication_key||crypto.createHash("sha256").update(`${type}:${occurred.toISOString()}:${Math.round(Number(item?.duration_seconds||0))}`).digest("hex"));
    const result = await query(
      `INSERT INTO ai_interview_events (interview_id,event_type,severity,occurred_at,duration_seconds,question_id,metadata_json,evidence_timestamp_seconds,warning_number,deduplication_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) ON CONFLICT (interview_id,deduplication_key) DO NOTHING RETURNING id`,
      [interview.id,type,severity,occurred.toISOString(),Math.max(0,Number(item?.duration_seconds||0)),item?.question_id||null,JSON.stringify(item?.metadata||{}),item?.evidence_timestamp_seconds||null,warningNumber,dedupe]
    );
    accepted += result.rowCount||0;
  }
  return NextResponse.json({ accepted });
}
