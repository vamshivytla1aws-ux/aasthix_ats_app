import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { COMPLIANCE_V4_ENABLED } from "@/lib/featureFlags";
import { createExportRequest } from "@/lib/phase4/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requirePermission("jobs.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!COMPLIANCE_V4_ENABLED) {
    return NextResponse.json({
      enabled: false,
      request: null,
      operation_status: "blocked",
      health_status: "blocked",
      user_message: "Compliance governance is disabled by flag.",
      trace_id: `compliance-export-${Date.now()}`,
    });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const reqRecord = await createExportRequest({
      requested_by: auth.access.user_id,
      scope: body?.scope && typeof body.scope === "object" ? body.scope : {},
    });
    return NextResponse.json({
      enabled: true,
      request: reqRecord,
      operation_status: "success",
      health_status: "healthy",
      user_message: "Export request submitted.",
      last_evaluated_at: new Date().toISOString(),
      owner: "compliance-admin",
      trace_id: `compliance-export-${Date.now()}`,
    });
  } catch (error) {
    console.error("POST /api/compliance/data-export/request", error);
    return NextResponse.json({ error: "Failed to create export request" }, { status: 500 });
  }
}
