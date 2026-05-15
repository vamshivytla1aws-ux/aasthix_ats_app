import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { COMPLIANCE_V4_ENABLED } from "@/lib/featureFlags";
import { createLegalHold } from "@/lib/phase4/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!COMPLIANCE_V4_ENABLED) {
    return NextResponse.json({
      enabled: false,
      legal_hold: null,
      operation_status: "blocked",
      health_status: "blocked",
      user_message: "Compliance governance is disabled by flag.",
      trace_id: `compliance-legal-hold-${Date.now()}`,
    });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const entityId = Number(body?.entity_id);
    if (!Number.isFinite(entityId) || entityId <= 0) {
      return NextResponse.json({ error: "entity_id is required" }, { status: 400 });
    }
    const legal_hold = await createLegalHold({
      entity_type: String(body?.entity_type || "candidates"),
      entity_id: entityId,
      reason: String(body?.reason || "Compliance hold requested"),
      created_by: auth.access.user_id,
    });
    return NextResponse.json({
      enabled: true,
      legal_hold,
      operation_status: "success",
      health_status: "healthy",
      user_message: "Legal hold created.",
      last_evaluated_at: new Date().toISOString(),
      owner: "compliance-admin",
      trace_id: `compliance-legal-hold-${Date.now()}`,
    });
  } catch (error) {
    console.error("POST /api/compliance/legal-hold", error);
    return NextResponse.json({ error: "Failed to create legal hold" }, { status: 500 });
  }
}
