import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { AUTOMATION_V3_ENABLED } from "@/lib/featureFlags";
import { runAutomation } from "@/lib/phase3/automation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requirePermission("jobs.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!AUTOMATION_V3_ENABLED) {
    return NextResponse.json({
      enabled: false,
      runs: [],
      operation_status: "blocked",
      mode: "recommend_only",
      trigger_source: "simulate_api",
      rule_version: null,
      affected_entities: [],
      execution_trace_id: `automation-simulate-${Date.now()}`,
    });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const scope = body?.scope && typeof body.scope === "object" ? body.scope : {};
    const ruleId = Number(body?.rule_id);
    const runs = await runAutomation({
      mode: "simulate",
      actorUserId: auth.access.user_id,
      ruleId: Number.isFinite(ruleId) ? ruleId : undefined,
      scope,
    });
    return NextResponse.json({
      enabled: true,
      operation_status: "success",
      mode: "recommend_only",
      trigger_source: "simulate_api",
      rule_version: "v3",
      affected_entities: runs.map((run: any) => Number(run.entity_id)).filter((id: number) => Number.isFinite(id)),
      execution_trace_id: `automation-simulate-${Date.now()}`,
      runs,
    });
  } catch (error) {
    console.error("POST /api/automation/simulate", error);
    return NextResponse.json({ error: "Failed to simulate automation" }, { status: 500 });
  }
}
