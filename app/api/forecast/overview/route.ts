import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { FORECAST_V3_ENABLED } from "@/lib/featureFlags";
import { getForecastOverview } from "@/lib/phase3/forecast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("jobs.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!FORECAST_V3_ENABLED) return NextResponse.json({ enabled: false, series: [] });
  try {
    const series = await getForecastOverview();
    return NextResponse.json({ enabled: true, series, generated_at: new Date().toISOString() });
  } catch (error) {
    console.error("GET /api/forecast/overview", error);
    return NextResponse.json({ error: "Failed to load forecast overview" }, { status: 500 });
  }
}
