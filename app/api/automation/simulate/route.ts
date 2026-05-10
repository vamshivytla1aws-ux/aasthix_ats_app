import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { AUTOMATION_V3_ENABLED } from "@/lib/featureFlags";
import { runAutomation } from "@/lib/phase3/automation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requirePermission("jobs.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!AUTOMATION_V3_ENABLED) return NextResponse.json({ enabled: false, runs: [] });
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
    return NextResponse.json({ enabled: true, runs });
  } catch (error) {
    console.error("POST /api/automation/simulate", error);
    return NextResponse.json({ error: "Failed to simulate automation" }, { status: 500 });
  }
}
