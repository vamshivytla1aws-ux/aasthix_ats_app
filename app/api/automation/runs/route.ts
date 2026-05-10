import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { AUTOMATION_V3_ENABLED } from "@/lib/featureFlags";
import { listAutomationRuns } from "@/lib/phase3/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePermission("jobs.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!AUTOMATION_V3_ENABLED) return NextResponse.json({ enabled: false, runs: [] });
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const runs = await listAutomationRuns(limit);
    return NextResponse.json({ enabled: true, runs });
  } catch (error) {
    console.error("GET /api/automation/runs", error);
    return NextResponse.json({ error: "Failed to load automation runs" }, { status: 500 });
  }
}
