import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { FORECAST_V3_ENABLED } from "@/lib/featureFlags";
import { getForecastCapacity } from "@/lib/phase3/forecast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePermission("jobs.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!FORECAST_V3_ENABLED) return NextResponse.json({ enabled: false, operation_status: "blocked", rows: [] });
  try {
    const url = new URL(request.url);
    const scenario = {
      sourcing_uplift: Number(url.searchParams.get("sourcing_uplift") ?? 0),
      recruiter_capacity_delta: Number(url.searchParams.get("recruiter_capacity_delta") ?? 0),
      sla_strictness_multiplier: Number(url.searchParams.get("sla_strictness_multiplier") ?? 1),
    };
    const payload = await getForecastCapacity(scenario);
    return NextResponse.json({ enabled: true, operation_status: "success", ...payload });
  } catch (error) {
    console.error("GET /api/forecast/capacity", error);
    return NextResponse.json({ error: "Failed to load capacity forecast" }, { status: 500 });
  }
}
