import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { ORG_GOVERNANCE_V4_ENABLED } from "@/lib/featureFlags";
import { listAccessPolicies, upsertAccessPolicy } from "@/lib/phase4/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!ORG_GOVERNANCE_V4_ENABLED) return NextResponse.json({ enabled: false, policies: [] });
  try {
    const policies = await listAccessPolicies();
    return NextResponse.json({ enabled: true, policies });
  } catch (error) {
    console.error("GET /api/org/policies/access", error);
    return NextResponse.json({ error: "Failed to load access policies" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!ORG_GOVERNANCE_V4_ENABLED) return NextResponse.json({ enabled: false, policy: null });
  try {
    const body = await request.json().catch(() => ({}));
    const policy = await upsertAccessPolicy({
      policy_name: String(body?.policy_name || "default_visibility"),
      policy_type: String(body?.policy_type || "visibility"),
      enabled: body?.enabled !== false,
      rule: body?.rule && typeof body.rule === "object" ? body.rule : {},
    });
    return NextResponse.json({ enabled: true, policy });
  } catch (error) {
    console.error("PUT /api/org/policies/access", error);
    return NextResponse.json({ error: "Failed to update access policy" }, { status: 500 });
  }
}
