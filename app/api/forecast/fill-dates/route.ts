import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { FORECAST_V3_ENABLED } from "@/lib/featureFlags";
import { getForecastFillDates } from "@/lib/phase3/forecast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("jobs.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!FORECAST_V3_ENABLED) return NextResponse.json({ enabled: false, rows: [] });
  try {
    const payload = await getForecastFillDates();
    return NextResponse.json({ enabled: true, ...payload });
  } catch (error) {
    console.error("GET /api/forecast/fill-dates", error);
    return NextResponse.json({ error: "Failed to load fill-date forecast" }, { status: 500 });
  }
}
