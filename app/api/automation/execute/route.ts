import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { AUTOMATION_V3_ENABLED } from "@/lib/featureFlags";
import { runAutomation } from "@/lib/phase3/automation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!AUTOMATION_V3_ENABLED) return NextResponse.json({ enabled: false, runs: [] });
  try {
    const body = await request.json().catch(() => ({}));
    const scope = body?.scope && typeof body.scope === "object" ? body.scope : {};
    const ruleId = Number(body?.rule_id);
    const runs = await runAutomation({
      mode: "execute",
      actorUserId: auth.access.user_id,
      ruleId: Number.isFinite(ruleId) ? ruleId : undefined,
      scope,
    });
    return NextResponse.json({ enabled: true, runs });
  } catch (error) {
    console.error("POST /api/automation/execute", error);
    return NextResponse.json({ error: "Failed to execute automation" }, { status: 500 });
  }
}
