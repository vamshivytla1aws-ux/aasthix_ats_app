import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { INTEGRATIONS_V4_ENABLED } from "@/lib/featureFlags";
import { listIntegrationRuns } from "@/lib/phase4/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!INTEGRATIONS_V4_ENABLED) return NextResponse.json({ enabled: false, runs: [] });
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 100);
    const runs = await listIntegrationRuns(limit);
    return NextResponse.json({ enabled: true, runs });
  } catch (error) {
    console.error("GET /api/integrations/runs", error);
    return NextResponse.json({ error: "Failed to load integration runs" }, { status: 500 });
  }
}
