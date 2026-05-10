import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { INTELLIGENCE_V3_ENABLED } from "@/lib/featureFlags";
import { getJobRisks } from "@/lib/phase3/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePermission("jobs.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!INTELLIGENCE_V3_ENABLED) return NextResponse.json({ enabled: false, rows: [] });
  try {
    const url = new URL(request.url);
    const jobIdRaw = url.searchParams.get("job_id");
    const parsed = jobIdRaw ? Number(jobIdRaw) : NaN;
    const rows = await getJobRisks(Number.isFinite(parsed) ? parsed : undefined);
    return NextResponse.json({ enabled: true, rows });
  } catch (error) {
    console.error("GET /api/intelligence/job-risk", error);
    return NextResponse.json({ error: "Failed to load job risk insights" }, { status: 500 });
  }
}
