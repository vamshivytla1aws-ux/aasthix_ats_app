import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { AI_GOVERNANCE_V4_ENABLED } from "@/lib/featureFlags";
import { recomputeDrift } from "@/lib/phase4/service";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!AI_GOVERNANCE_V4_ENABLED) return NextResponse.json({ enabled: false, signals: [] });
  try {
    const signals = await recomputeDrift();
    return NextResponse.json({ enabled: true, signals });
  } catch (error) {
    console.error("POST /api/ai-governance/drift/recompute", error);
    return NextResponse.json({ error: "Failed to recompute drift signals" }, { status: 500 });
  }
}
