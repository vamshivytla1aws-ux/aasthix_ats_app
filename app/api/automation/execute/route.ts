import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { AUTOMATION_V3_ENABLED } from "@/lib/featureFlags";
import { runAutomation } from "@/lib/phase3/automation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!AUTOMATION_V3_ENABLED) return NextResponse.json({ enabled: false, runs: [], operation_status: "blocked" });
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.global_pause === true) {
      return NextResponse.json({
        enabled: true,
        operation_status: "blocked",
        mode: "recommend_only",
        trigger_source: "execute_api",
        error: "Global automation pause is active.",
        runs: [],
      });
    }
    const scope = body?.scope && typeof body.scope === "object" ? body.scope : {};
    const ruleId = Number(body?.rule_id);
    const allowExecute = body?.allow_execute === true;
    if (!allowExecute) {
      return NextResponse.json({
        enabled: true,
        operation_status: "blocked",
        mode: "recommend_only",
        trigger_source: "execute_api",
        error: "Execution blocked by policy. Set allow_execute=true for controlled execution.",
        runs: [],
      });
    }
    const runs = await runAutomation({
      mode: "execute",
      actorUserId: auth.access.user_id,
      ruleId: Number.isFinite(ruleId) ? ruleId : undefined,
      scope,
    });
    return NextResponse.json({
      enabled: true,
      operation_status: "success",
      mode: "approval_required",
      trigger_source: "execute_api",
      runs,
    });
  } catch (error) {
    console.error("POST /api/automation/execute", error);
    return NextResponse.json({ error: "Failed to execute automation" }, { status: 500 });
  }
}
