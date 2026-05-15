import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { AI_GOVERNANCE_V4_ENABLED } from "@/lib/featureFlags";
import { recomputeDrift } from "@/lib/phase4/service";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!AI_GOVERNANCE_V4_ENABLED) {
    return NextResponse.json({
      enabled: false,
      signals: [],
      operation_status: "blocked",
      health_status: "blocked",
      user_message: "AI governance is disabled by flag.",
      trace_id: `ai-gov-drift-${Date.now()}`,
    });
  }
  try {
    const signals = await recomputeDrift();
    return NextResponse.json({
      enabled: true,
      signals,
      operation_status: "success",
      health_status: signals.some((signal: { drift_score: number }) => signal.drift_score > 0.15) ? "warning" : "healthy",
      user_message: "Drift recompute completed.",
      last_evaluated_at: new Date().toISOString(),
      owner: "ai-governance-admin",
      trace_id: `ai-gov-drift-${Date.now()}`,
    });
  } catch (error) {
    console.error("POST /api/ai-governance/drift/recompute", error);
    return NextResponse.json({ error: "Failed to recompute drift signals" }, { status: 500 });
  }
}
