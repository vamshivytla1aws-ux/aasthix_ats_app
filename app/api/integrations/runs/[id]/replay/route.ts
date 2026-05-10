import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { INTEGRATIONS_V4_ENABLED } from "@/lib/featureFlags";
import { replayIntegrationRun } from "@/lib/phase4/service";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!INTEGRATIONS_V4_ENABLED) return NextResponse.json({ enabled: false, run: null });
  const runId = Number(params.id);
  if (!Number.isFinite(runId) || runId <= 0) return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  try {
    const run = await replayIntegrationRun(runId);
    return NextResponse.json({ enabled: true, run });
  } catch (error) {
    console.error("POST /api/integrations/runs/:id/replay", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to replay integration run" }, { status: 500 });
  }
}
