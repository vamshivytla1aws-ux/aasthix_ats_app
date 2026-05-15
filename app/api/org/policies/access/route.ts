import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { ORG_GOVERNANCE_V4_ENABLED } from "@/lib/featureFlags";
import { listAccessPolicies, upsertAccessPolicy } from "@/lib/phase4/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!ORG_GOVERNANCE_V4_ENABLED) {
    return NextResponse.json({
      enabled: false,
      policies: [],
      operation_status: "blocked",
      health_status: "blocked",
      user_message: "Access governance is disabled by flag.",
      trace_id: `org-access-policies-${Date.now()}`,
    });
  }
  try {
    const policies = await listAccessPolicies();
    return NextResponse.json({
      enabled: true,
      policies,
      operation_status: "success",
      health_status: policies.length > 0 ? "healthy" : "warning",
      last_evaluated_at: new Date().toISOString(),
      owner: "org-admin",
      trace_id: `org-access-policies-${Date.now()}`,
    });
  } catch (error) {
    console.error("GET /api/org/policies/access", error);
    return NextResponse.json({ error: "Failed to load access policies" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!ORG_GOVERNANCE_V4_ENABLED) {
    return NextResponse.json({
      enabled: false,
      policy: null,
      operation_status: "blocked",
      health_status: "blocked",
      user_message: "Access governance is disabled by flag.",
      trace_id: `org-access-policies-update-${Date.now()}`,
    });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const policy = await upsertAccessPolicy({
      policy_name: String(body?.policy_name || "default_visibility"),
      policy_type: String(body?.policy_type || "visibility"),
      enabled: body?.enabled !== false,
      rule: body?.rule && typeof body.rule === "object" ? body.rule : {},
    });
    return NextResponse.json({
      enabled: true,
      policy,
      operation_status: "success",
      user_message: "Access policy updated.",
      health_status: policy.enabled ? "healthy" : "warning",
      last_evaluated_at: new Date().toISOString(),
      owner: "org-admin",
      trace_id: `org-access-policies-update-${Date.now()}`,
    });
  } catch (error) {
    console.error("PUT /api/org/policies/access", error);
    return NextResponse.json({ error: "Failed to update access policy" }, { status: 500 });
  }
}
