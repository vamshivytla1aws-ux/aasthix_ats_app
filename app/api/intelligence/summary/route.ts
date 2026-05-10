import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { INTELLIGENCE_V3_ENABLED } from "@/lib/featureFlags";
import { getIntelligenceSummary } from "@/lib/phase3/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("jobs.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!INTELLIGENCE_V3_ENABLED) {
    return NextResponse.json({ enabled: false, message: "INTELLIGENCE_V3_ENABLED is disabled" });
  }
  try {
    const summary = await getIntelligenceSummary();
    return NextResponse.json({ enabled: true, summary });
  } catch (error) {
    console.error("GET /api/intelligence/summary", error);
    return NextResponse.json({ error: "Failed to load intelligence summary" }, { status: 500 });
  }
}
