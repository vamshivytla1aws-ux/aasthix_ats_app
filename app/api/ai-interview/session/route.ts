import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAiInterviewEnabled } from "@/lib/aiInterviews/config";
import { AI_INTERVIEW_SESSION_COOKIE, createCandidateSession, hashInterviewToken } from "@/lib/aiInterviews/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    requireAiInterviewEnabled();
    const body = await request.json();
    const token = String(body?.token || "").trim();
    if (token.length < 32 || token.length > 200) return NextResponse.json({ error: "Invalid interview link" }, { status: 400 });
    const result = await query(
      `SELECT ai.id,ai.candidate_id,ai.status,ai.title,ai.instructions,ai.duration_minutes,ai.expires_at,
              ai.camera_required,ai.microphone_required,ai.recording_enabled,ai.screen_share_enabled,
              ai.fullscreen_required,ai.face_monitoring_enabled,ai.gaze_monitoring_enabled,
              c.full_name AS candidate_name,j.title AS job_title
         FROM ai_interviews ai JOIN candidates c ON c.id=ai.candidate_id JOIN jobs j ON j.id=ai.job_id
        WHERE ai.secure_token_hash=$1 AND ai.token_revoked_at IS NULL LIMIT 1`,
      [hashInterviewToken(token)]
    );
    if (!result.rowCount) return NextResponse.json({ error: "This interview link is invalid or has been revoked." }, { status: 404 });
    const row = result.rows[0];
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await query(`UPDATE ai_interviews SET status='EXPIRED',updated_at=NOW() WHERE id=$1 AND status NOT IN ('COMPLETED','CANCELLED')`, [row.id]);
      return NextResponse.json({ error: "This interview link has expired." }, { status: 410 });
    }
    if (["COMPLETED","CANCELLED","EXPIRED"].includes(row.status)) return NextResponse.json({ error: `This interview is ${String(row.status).toLowerCase()}.` }, { status: 409 });
    if (row.status === "DRAFT") return NextResponse.json({ error: "This interview has not been activated yet." }, { status: 409 });
    const tokenHash = hashInterviewToken(token);
    const session = await createCandidateSession({ interviewId: Number(row.id), candidateId: Number(row.candidate_id), tokenHash, expiresAt: new Date(row.expires_at) });
    const response = NextResponse.json({
      interview: {
        id: row.id,title: row.title,instructions: row.instructions,duration_minutes: row.duration_minutes,expires_at: row.expires_at,
        candidate_name: row.candidate_name,job_title: row.job_title,status: row.status,
        requirements: { camera: row.camera_required,microphone: row.microphone_required,recording: row.recording_enabled,
          screen_share: row.screen_share_enabled,fullscreen: row.fullscreen_required,face_monitoring: row.face_monitoring_enabled,gaze_monitoring: row.gaze_monitoring_enabled },
      },
    });
    response.cookies.set(AI_INTERVIEW_SESSION_COOKIE, session, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 24*60*60 });
    return response;
  } catch (error) {
    console.error("[ai-interview] session exchange", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to open interview" }, { status: 500 });
  }
}
