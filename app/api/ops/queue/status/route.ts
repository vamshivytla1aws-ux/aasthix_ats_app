import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { SRE_HARDENING_V4_ENABLED } from "@/lib/featureFlags";
import { getQueueJobCounts } from "@/lib/queue/queueMonitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!SRE_HARDENING_V4_ENABLED) return NextResponse.json({ enabled: false, queue: null });
  try {
    const queue = await getQueueJobCounts();
    return NextResponse.json({ enabled: true, queue, generated_at: new Date().toISOString() });
  } catch (error) {
    console.error("GET /api/ops/queue/status", error);
    return NextResponse.json({ error: "Failed to load queue status" }, { status: 500 });
  }
}
