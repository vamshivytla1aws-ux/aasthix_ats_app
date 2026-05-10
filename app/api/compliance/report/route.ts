import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { COMPLIANCE_V4_ENABLED } from "@/lib/featureFlags";
import { listRetentionPolicies } from "@/lib/phase4/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!COMPLIANCE_V4_ENABLED) return NextResponse.json({ enabled: false, report: null });
  try {
    const retention = await listRetentionPolicies();
    return NextResponse.json({
      enabled: true,
      report: {
        generated_at: new Date().toISOString(),
        retention_policies: retention,
        pii_masking: { status: "policy_ready", source: "Configured manually" },
        audit_export: { status: "enabled", mode: "immutable_log" },
      },
    });
  } catch (error) {
    console.error("GET /api/compliance/report", error);
    return NextResponse.json({ error: "Failed to generate compliance report" }, { status: 500 });
  }
}
