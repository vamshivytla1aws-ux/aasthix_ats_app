import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { AI_GOVERNANCE_V4_ENABLED } from "@/lib/featureFlags";
import { getAiGovernanceAudit } from "@/lib/phase4/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!AI_GOVERNANCE_V4_ENABLED) return NextResponse.json({ enabled: false, records: [] });
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const records = await getAiGovernanceAudit(limit);
    return NextResponse.json({ enabled: true, records });
  } catch (error) {
    console.error("GET /api/ai-governance/audit", error);
    return NextResponse.json({ error: "Failed to load AI governance audit" }, { status: 500 });
  }
}
