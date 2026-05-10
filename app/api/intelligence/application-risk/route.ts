import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { INTELLIGENCE_V3_ENABLED } from "@/lib/featureFlags";
import { getApplicationRisks } from "@/lib/phase3/intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePermission("pipeline.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!INTELLIGENCE_V3_ENABLED) return NextResponse.json({ enabled: false, rows: [] });
  try {
    const url = new URL(request.url);
    const applicationIdRaw = url.searchParams.get("application_id");
    const applicationId = applicationIdRaw ? Number(applicationIdRaw) : undefined;
    const rows = await getApplicationRisks(Number.isFinite(applicationId as number) ? applicationId : undefined);
    return NextResponse.json({ enabled: true, rows });
  } catch (error) {
    console.error("GET /api/intelligence/application-risk", error);
    return NextResponse.json({ error: "Failed to load application risk insights" }, { status: 500 });
  }
}
