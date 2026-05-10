import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { SRE_HARDENING_V4_ENABLED } from "@/lib/featureFlags";
import { verifyBackup } from "@/lib/phase4/service";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!SRE_HARDENING_V4_ENABLED) return NextResponse.json({ enabled: false, verification: null });
  try {
    const verification = await verifyBackup();
    return NextResponse.json({ enabled: true, verification });
  } catch (error) {
    console.error("POST /api/ops/backup/verify", error);
    return NextResponse.json({ error: "Failed to verify backup readiness" }, { status: 500 });
  }
}
