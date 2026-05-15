import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { INTELLIGENCE_V3_ENABLED } from "@/lib/featureFlags";
import { recomputeApplicationRisks, recomputeJobRisks } from "@/lib/phase3/intelligence";
import { recordPhase3AuditEvent } from "@/lib/phase3/audit";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requirePermission("jobs.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!INTELLIGENCE_V3_ENABLED) {
    return NextResponse.json({
      enabled: false,
      operation_status: "blocked",
      message: "INTELLIGENCE_V3_ENABLED is disabled",
    });
  }
  try {
    await Promise.all([recomputeApplicationRisks(), recomputeJobRisks()]);
    await recordPhase3AuditEvent({
      actorUserId: auth.access.user_id,
      action: "phase3.intelligence.recompute",
      metadata: { status: "success" },
    });
    return NextResponse.json({
      ok: true,
      operation_status: "success",
      timezone_used: "Asia/Kolkata",
      definition_used: "Recomputed application/job risk insights from latest ATS data.",
      recomputed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/intelligence/recompute", error);
    await recordPhase3AuditEvent({
      actorUserId: auth.access.user_id,
      action: "phase3.intelligence.recompute_failed",
      metadata: { error: error instanceof Error ? error.message : "unknown" },
    });
    return NextResponse.json(
      {
        error: "Failed to recompute intelligence insights",
        operation_status: "error",
      },
      { status: 500 }
    );
  }
}
