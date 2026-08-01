import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { canAccessAiInterview } from "@/lib/aiInterviews/access";
import { requireAiInterviewEnabled } from "@/lib/aiInterviews/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(id: number, permission: "ai_interviews.view" | "ai_interviews.update" | "ai_interviews.cancel") {
  const auth = await requirePermission(permission);
  if (!auth.ok) return auth;
  if (!(await canAccessAiInterview(auth.access, id))) return { ok: false as const, status: 403, error: "Forbidden" };
  return auth;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireAiInterviewEnabled();
    const id = Number((await context.params).id);
    const auth = await authorize(id, "ai_interviews.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const [interview, questions, events] = await Promise.all([
      query(`SELECT ai.*, c.full_name AS candidate_name,c.email AS candidate_email,c.phone AS candidate_phone,c.resume_text,
                    j.title AS job_title,j.description AS job_description,j.experience_requirement,
                    u.full_name AS created_by_name
               FROM ai_interviews ai JOIN candidates c ON c.id=ai.candidate_id JOIN jobs j ON j.id=ai.job_id
               JOIN users u ON u.id=ai.created_by_user_id WHERE ai.id=$1`, [id]),
      query(`SELECT * FROM ai_interview_questions WHERE interview_id=$1 ORDER BY order_number,id`, [id]),
      query(`SELECT * FROM ai_interview_events WHERE interview_id=$1 ORDER BY occurred_at DESC LIMIT 100`, [id]),
    ]);
    if (!interview.rowCount) return NextResponse.json({ error: "AI interview not found" }, { status: 404 });
    return NextResponse.json({ interview: interview.rows[0], questions: questions.rows, events: events.rows });
  } catch (error) {
    console.error("[ai-interviews] detail", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load AI interview" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await authorize(id, "ai_interviews.update");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json();
  const decision = body?.recruiter_decision == null ? null : String(body.recruiter_decision).toUpperCase();
  if (decision && !["PROCEED","HOLD","REJECT","SCHEDULE_HUMAN_INTERVIEW"].includes(decision)) {
    return NextResponse.json({ error: "Invalid recruiter decision" }, { status: 400 });
  }
  const result = await query(
    `UPDATE ai_interviews SET
       title=COALESCE($2,title), instructions=COALESCE($3,instructions), expires_at=COALESCE($4,expires_at),
       recruiter_decision=COALESCE($5,recruiter_decision), recruiter_comments=COALESCE($6,recruiter_comments), updated_at=NOW()
     WHERE id=$1 RETURNING *`,
    [id, body?.title || null, body?.instructions ?? null, body?.expires_at || null, decision, body?.recruiter_comments ?? null]
  );
  await query(`INSERT INTO ai_interview_audit_events (interview_id,actor_user_id,event_type,metadata_json) VALUES ($1,$2,'UPDATED',$3::jsonb)`, [id,auth.access.user_id,JSON.stringify({ decision })]);
  return NextResponse.json({ interview: result.rows[0] });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await authorize(id, "ai_interviews.cancel");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const result = await query(
    `UPDATE ai_interviews SET status='CANCELLED',token_revoked_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND status NOT IN ('COMPLETED','CANCELLED','EXPIRED') RETURNING id,status`, [id]
  );
  if (!result.rowCount) return NextResponse.json({ error: "Interview cannot be cancelled in its current status" }, { status: 409 });
  await query(`INSERT INTO ai_interview_audit_events (interview_id,actor_user_id,event_type) VALUES ($1,$2,'CANCELLED')`, [id,auth.access.user_id]);
  return NextResponse.json({ interview: result.rows[0] });
}
