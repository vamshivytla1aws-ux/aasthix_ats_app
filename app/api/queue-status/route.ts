import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { getQueueJobCounts } from "@/lib/queue/queueMonitor";
import { redisPing } from "@/lib/services/cacheService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/queue-status — BullMQ counters for observability (requires jobs.view).
 */
export async function GET() {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const counts = await getQueueJobCounts();
    if (!counts) {
      return NextResponse.json({
        enabled: false,
        redis: await redisPing(),
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        paused: 0,
        message: "REDIS_URL not set — queue disabled",
      });
    }

    return NextResponse.json({
      enabled: true,
      redis: await redisPing(),
      ...counts,
    });
  } catch (e) {
    console.error("queue-status", e);
    return NextResponse.json({ error: "Failed to read queue status" }, { status: 500 });
  }
}
