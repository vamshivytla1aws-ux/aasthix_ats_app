import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { canAccessAiInterview } from "@/lib/aiInterviews/access";
import { sendAiInterviewInviteEmail } from "@/lib/aiInterviews/inviteEmail";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  const auth = await requirePermission("ai_interviews.create");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!(await canAccessAiInterview(auth.access, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const result = await sendAiInterviewInviteEmail(id, auth.access.user_id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, detail: result.detail, recipient: result.recipient },
      { status: result.status }
    );
  }

  return NextResponse.json(result);
}
