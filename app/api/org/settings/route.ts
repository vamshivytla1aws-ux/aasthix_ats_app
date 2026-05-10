import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { ORG_GOVERNANCE_V4_ENABLED } from "@/lib/featureFlags";
import { getOrgSettings, updateOrgSettings } from "@/lib/phase4/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!ORG_GOVERNANCE_V4_ENABLED) return NextResponse.json({ enabled: false, settings: null });
  try {
    const settings = await getOrgSettings();
    return NextResponse.json({ enabled: true, settings });
  } catch (error) {
    console.error("GET /api/org/settings", error);
    return NextResponse.json({ error: "Failed to load org settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!ORG_GOVERNANCE_V4_ENABLED) return NextResponse.json({ enabled: false, settings: null });
  try {
    const body = await request.json().catch(() => ({}));
    const settings = await updateOrgSettings(body?.config && typeof body.config === "object" ? body.config : {});
    return NextResponse.json({ enabled: true, settings });
  } catch (error) {
    console.error("PUT /api/org/settings", error);
    return NextResponse.json({ error: "Failed to update org settings" }, { status: 500 });
  }
}
