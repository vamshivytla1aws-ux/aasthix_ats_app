import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { AI_GOVERNANCE_V4_ENABLED } from "@/lib/featureFlags";
import { listAiPolicies, upsertAiPolicy } from "@/lib/phase4/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!AI_GOVERNANCE_V4_ENABLED) return NextResponse.json({ enabled: false, policies: [] });
  try {
    const policies = await listAiPolicies();
    return NextResponse.json({ enabled: true, policies });
  } catch (error) {
    console.error("GET /api/ai-governance/policies", error);
    return NextResponse.json({ error: "Failed to load AI governance policies" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!AI_GOVERNANCE_V4_ENABLED) return NextResponse.json({ enabled: false, policy: null });
  try {
    const body = await request.json().catch(() => ({}));
    const policy = await upsertAiPolicy({
      workflow_key: String(body?.workflow_key || "hr_assistant"),
      approved_models: Array.isArray(body?.approved_models) ? body.approved_models.map(String) : ["gpt-4o-mini"],
      pinned_model: typeof body?.pinned_model === "string" ? body.pinned_model : null,
      risk_tier: typeof body?.risk_tier === "string" ? body.risk_tier : "standard",
    });
    return NextResponse.json({ enabled: true, policy });
  } catch (error) {
    console.error("PUT /api/ai-governance/policies", error);
    return NextResponse.json({ error: "Failed to update AI governance policy" }, { status: 500 });
  }
}
