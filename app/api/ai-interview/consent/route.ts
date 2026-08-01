import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireCandidateInterview } from "@/lib/aiInterviews/access";
import { aiInterviewConfig } from "@/lib/aiInterviews/config";

export const runtime = "nodejs";
const CONSENT_VERSION = "2026-08-01";
const CONSENT_TEXT = "Camera, microphone, recording, optional screen sharing, browser activity monitoring, face presence and approximate head-direction monitoring may be used for this interview. Results are reviewed by authorized recruiters.";

export async function POST(request: NextRequest) {
  const interview = await requireCandidateInterview();
  if (!interview) return NextResponse.json({ error: "Interview session is invalid" }, { status: 401 });
  const body = await request.json();
  const required = ["camera_consent","microphone_consent","recording_consent","monitoring_consent"];
  if (required.some((key) => body?.[key] !== true)) return NextResponse.json({ error: "All required consents must be accepted" }, { status: 400 });
  if (interview.screen_share_enabled && body?.screen_share_consent !== true) return NextResponse.json({ error: "Screen-share consent is required for this interview" }, { status: 400 });
  await query(
    `INSERT INTO ai_interview_consents (interview_id,candidate_id,consent_version,consent_text_hash,camera_consent,microphone_consent,recording_consent,screen_share_consent,monitoring_consent,accepted_at,ip_address,user_agent)
     VALUES ($1,$2,$3,$4,TRUE,TRUE,TRUE,$5,TRUE,NOW(),$6,$7)
     ON CONFLICT (interview_id) DO UPDATE SET camera_consent=TRUE,microphone_consent=TRUE,recording_consent=TRUE,screen_share_consent=EXCLUDED.screen_share_consent,monitoring_consent=TRUE,accepted_at=NOW(),user_agent=EXCLUDED.user_agent`,
    [interview.id,interview.candidate_id,CONSENT_VERSION,crypto.createHash("sha256").update(CONSENT_TEXT).digest("hex"),Boolean(body?.screen_share_consent),aiInterviewConfig.storeCandidateIp?request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||null:null,request.headers.get("user-agent")]
  );
  return NextResponse.json({ accepted: true, consent_version: CONSENT_VERSION });
}
