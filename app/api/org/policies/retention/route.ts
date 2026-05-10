import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { COMPLIANCE_V4_ENABLED } from "@/lib/featureFlags";
import { listRetentionPolicies, upsertRetentionPolicy } from "@/lib/phase4/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!COMPLIANCE_V4_ENABLED) return NextResponse.json({ enabled: false, policies: [] });
  try {
    const policies = await listRetentionPolicies();
    return NextResponse.json({ enabled: true, policies });
  } catch (error) {
    console.error("GET /api/org/policies/retention", error);
    return NextResponse.json({ error: "Failed to load retention policies" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!COMPLIANCE_V4_ENABLED) return NextResponse.json({ enabled: false, policy: null });
  try {
    const body = await request.json().catch(() => ({}));
    const policy = await upsertRetentionPolicy({
      entity_type: String(body?.entity_type || "candidates"),
      retention_days: Math.max(1, Number(body?.retention_days || 365)),
      legal_hold: Boolean(body?.legal_hold),
      archive_before_purge: body?.archive_before_purge !== false,
    });
    return NextResponse.json({ enabled: true, policy });
  } catch (error) {
    console.error("PUT /api/org/policies/retention", error);
    return NextResponse.json({ error: "Failed to update retention policy" }, { status: 500 });
  }
}
