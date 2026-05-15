import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { INTELLIGENCE_V3_ENABLED, INTELLIGENCE_V3_FLAG_SOURCE } from "@/lib/featureFlags";
import { getIntelligenceSummary } from "@/lib/phase3/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("jobs.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!INTELLIGENCE_V3_ENABLED) {
    return NextResponse.json({
      enabled: false,
      resolved_from: INTELLIGENCE_V3_FLAG_SOURCE,
      message: "INTELLIGENCE_V3_ENABLED is disabled",
      operation_status: "blocked",
    });
  }
  try {
    const summary = await getIntelligenceSummary();
    return NextResponse.json({
      enabled: true,
      resolved_from: INTELLIGENCE_V3_FLAG_SOURCE,
      summary,
      definition_used: summary?.verification?.definition_used ?? "Risk summary from persisted V3 intelligence tables",
      timezone_used: summary?.verification?.timezone_used ?? "Asia/Kolkata",
      verified: summary?.verification?.verified ?? true,
      sample_ids: summary?.verification?.sample_ids ?? [],
      generated_at: summary?.verification?.generated_at ?? new Date().toISOString(),
      operation_status: "success",
    });
  } catch (error) {
    console.error("GET /api/intelligence/summary", error);
    return NextResponse.json({ error: "Failed to load intelligence summary" }, { status: 500 });
  }
}
