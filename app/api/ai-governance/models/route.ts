import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { AI_GOVERNANCE_V4_ENABLED } from "@/lib/featureFlags";
import { listAiModels } from "@/lib/phase4/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!AI_GOVERNANCE_V4_ENABLED) return NextResponse.json({ enabled: false, models: [] });
  try {
    const payload = await listAiModels();
    return NextResponse.json({ enabled: true, ...payload });
  } catch (error) {
    console.error("GET /api/ai-governance/models", error);
    return NextResponse.json({ error: "Failed to load AI governance models" }, { status: 500 });
  }
}
