import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { SRE_HARDENING_V4_ENABLED } from "@/lib/featureFlags";
import { listSloMetrics } from "@/lib/phase4/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!SRE_HARDENING_V4_ENABLED) return NextResponse.json({ enabled: false, metrics: [] });
  try {
    const metrics = await listSloMetrics();
    return NextResponse.json({ enabled: true, metrics, generated_at: new Date().toISOString() });
  } catch (error) {
    console.error("GET /api/ops/health/slo", error);
    return NextResponse.json({ error: "Failed to load SLO metrics" }, { status: 500 });
  }
}
