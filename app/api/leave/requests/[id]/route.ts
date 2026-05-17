import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { decideLeaveRequest } from "@/lib/leave";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseId(id: string) {
  const value = Number(id);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const auth = await requirePermission("leave.approve_team");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const id = parseId(context.params.id);
  if (!id) return NextResponse.json({ error: "Invalid leave request id." }, { status: 400 });

  try {
    const body = (await request.json().catch(() => null)) as { decision?: string; note?: string | null } | null;
    const decision = (body?.decision || "").toLowerCase();
    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json({ error: "Decision must be approved or rejected." }, { status: 400 });
    }
    const updated = await decideLeaveRequest({
      actorUserId: auth.access.user_id,
      actorRole: auth.access.role,
      requestId: id,
      decision,
      note: body?.note || null,
    });
    return NextResponse.json({
      request: updated,
      operation_status: "success",
      user_message: `Leave request ${decision}.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update leave request.",
        operation_status: "error",
        user_message: "Leave decision failed.",
      },
      { status: 400 },
    );
  }
}
