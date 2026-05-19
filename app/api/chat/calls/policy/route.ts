import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin, requirePermission } from "@/lib/rbac";
import { getChatCallPolicy } from "@/lib/chatCallGovernance";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const policy = await getChatCallPolicy();
    return NextResponse.json({ operation_status: "success", policy });
  } catch (error) {
    return NextResponse.json({ operation_status: "error", error: error instanceof Error ? error.message : "Failed to load call policy." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const body = await request.json().catch(() => ({}));

    const callStartScope = ["all", "manager_plus", "admin_plus"].includes(String(body?.call_start_scope))
      ? String(body.call_start_scope)
      : "all";
    const callShareScope = ["all", "host_only", "host_manager"].includes(String(body?.call_share_scope))
      ? String(body.call_share_scope)
      : "all";
    const maxCallParticipants = Math.max(2, Math.min(200, Number(body?.max_call_participants || 25)));
    const allowExternalLiveCalls = Boolean(body?.allow_external_live_calls);

    await query(
      `UPDATE chat_policies
       SET call_start_scope = $1,
           call_share_scope = $2,
           max_call_participants = $3,
           allow_external_live_calls = $4,
           updated_by = $5,
           updated_at = NOW()
       WHERE id = (SELECT id FROM chat_policies ORDER BY id DESC LIMIT 1)`,
      [callStartScope, callShareScope, maxCallParticipants, allowExternalLiveCalls, access.user_id],
    );

    await writeAuditLog({
      actorUserId: access.user_id,
      action: "chat.call.policy.updated",
      metadata: { call_start_scope: callStartScope, call_share_scope: callShareScope, max_call_participants: maxCallParticipants, allow_external_live_calls: allowExternalLiveCalls },
    });

    return NextResponse.json({
      operation_status: "success",
      user_message: "Call policy updated.",
      policy: {
        call_start_scope: callStartScope,
        call_share_scope: callShareScope,
        max_call_participants: maxCallParticipants,
        allow_external_live_calls: allowExternalLiveCalls,
      },
    });
  } catch (error) {
    return NextResponse.json({ operation_status: "error", error: error instanceof Error ? error.message : "Failed to update call policy." }, { status: 500 });
  }
}
