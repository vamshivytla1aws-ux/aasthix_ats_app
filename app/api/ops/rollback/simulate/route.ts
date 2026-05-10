import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { SRE_HARDENING_V4_ENABLED } from "@/lib/featureFlags";
import { simulateRollback } from "@/lib/phase4/service";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!SRE_HARDENING_V4_ENABLED) return NextResponse.json({ enabled: false, simulation: null });
  try {
    const simulation = await simulateRollback();
    return NextResponse.json({ enabled: true, simulation });
  } catch (error) {
    console.error("POST /api/ops/rollback/simulate", error);
    return NextResponse.json({ error: "Failed to simulate rollback" }, { status: 500 });
  }
}
