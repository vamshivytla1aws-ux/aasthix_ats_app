import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { canAccessAiInterview } from "@/lib/aiInterviews/access";

export const runtime = "nodejs";

const DECISIONS = new Set(["PROCEED", "HOLD", "REJECT", "SCHEDULE_HUMAN_INTERVIEW"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await requirePermission("ai_interviews.review");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await canAccessAiInterview(auth.access, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const decision = String(body?.recruiter_decision || "").trim().toUpperCase();
  const comments = String(body?.recruiter_comments || "").trim();
  if (!DECISIONS.has(decision)) return NextResponse.json({ error: "Select a valid interview decision" }, { status: 400 });
  if (comments.length > 5000) return NextResponse.json({ error: "Recruiter comments are too long" }, { status: 400 });
  const result = await query(
    `UPDATE ai_interviews SET recruiter_decision=$2,recruiter_comments=$3,updated_at=NOW()
      WHERE id=$1 AND status='COMPLETED' RETURNING recruiter_decision,recruiter_comments,updated_at`,
    [id, decision, comments || null]
  );
  if (!result.rowCount) return NextResponse.json({ error: "A decision can be saved only after the interview is completed" }, { status: 409 });
  await query(
    `INSERT INTO ai_interview_audit_events (interview_id,actor_user_id,event_type,metadata_json)
     VALUES ($1,$2,'RECRUITER_DECISION_SAVED',$3::jsonb)`,
    [id, auth.access.user_id, JSON.stringify({ decision })]
  );
  return NextResponse.json({ saved: true, ...result.rows[0] });
}
