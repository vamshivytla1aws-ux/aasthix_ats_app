import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { COMPLIANCE_V4_ENABLED } from "@/lib/featureFlags";
import { upsertSecurityPolicy } from "@/lib/phase4/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!COMPLIANCE_V4_ENABLED) return NextResponse.json({ enabled: false, policy: null });
  try {
    const body = await request.json().catch(() => ({}));
    const policy = await upsertSecurityPolicy({
      policy_type: "mfa",
      policy: body?.policy && typeof body.policy === "object" ? body.policy : { enforce_for_admin: true },
      enabled: body?.enabled !== false,
    });
    return NextResponse.json({ enabled: true, policy });
  } catch (error) {
    console.error("POST /api/security/mfa/policy", error);
    return NextResponse.json({ error: "Failed to update MFA policy" }, { status: 500 });
  }
}
