import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { canAccessAiInterview } from "@/lib/aiInterviews/access";
import { createSecureInterviewToken, hashInterviewToken } from "@/lib/aiInterviews/token";
import { buildPublicUrl } from "@/lib/publicUrl";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await requirePermission("ai_interviews.update");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await canAccessAiInterview(auth.access, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const count = await query(`SELECT COUNT(*)::int AS count FROM ai_interview_questions WHERE interview_id=$1`, [id]);
  if (Number(count.rows[0]?.count || 0) < 1) return NextResponse.json({ error: "Add at least one question before activation" }, { status: 400 });
  const token = createSecureInterviewToken();
  const result = await query(
    `UPDATE ai_interviews SET status='READY',secure_token_hash=$2,token_revoked_at=NULL,updated_at=NOW()
      WHERE id=$1 AND status IN ('DRAFT','SCHEDULED','READY') AND expires_at>NOW() RETURNING id,status,expires_at`,
    [id,hashInterviewToken(token)]
  );
  if (!result.rowCount) return NextResponse.json({ error: "Interview cannot be activated or has expired" }, { status: 409 });
  await query(`INSERT INTO ai_interview_audit_events (interview_id,actor_user_id,event_type) VALUES ($1,$2,'ACTIVATED')`, [id,auth.access.user_id]);
  return NextResponse.json({ interview: result.rows[0], public_url: buildPublicUrl(`/ai-interview/${token}`) });
}
