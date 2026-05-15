import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { SRE_HARDENING_V4_ENABLED } from "@/lib/featureFlags";
import { verifyBackup } from "@/lib/phase4/service";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!SRE_HARDENING_V4_ENABLED) {
    return NextResponse.json({
      enabled: false,
      verification: null,
      operation_status: "blocked",
      health_status: "blocked",
      user_message: "SRE hardening is disabled by flag.",
      trace_id: `ops-backup-${Date.now()}`,
    });
  }
  try {
    const verification = await verifyBackup();
    return NextResponse.json({
      enabled: true,
      verification,
      operation_status: "success",
      health_status: "healthy",
      user_message: "Backup readiness verified.",
      last_evaluated_at: new Date().toISOString(),
      owner: "sre-admin",
      trace_id: `ops-backup-${Date.now()}`,
    });
  } catch (error) {
    console.error("POST /api/ops/backup/verify", error);
    return NextResponse.json({ error: "Failed to verify backup readiness" }, { status: 500 });
  }
}
