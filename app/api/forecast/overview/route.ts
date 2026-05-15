import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { FORECAST_V3_ENABLED } from "@/lib/featureFlags";
import { getForecastOverview } from "@/lib/phase3/forecast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requirePermission("jobs.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!FORECAST_V3_ENABLED) {
    return NextResponse.json({
      enabled: false,
      operation_status: "blocked",
      series: [],
      confidence_band: "unavailable",
      as_of: null,
      data_latency_minutes: null,
      scenario_inputs: null,
    });
  }
  try {
    const url = new URL(request.url);
    const scenario = {
      sourcing_uplift: Number(url.searchParams.get("sourcing_uplift") ?? 0),
      recruiter_capacity_delta: Number(url.searchParams.get("recruiter_capacity_delta") ?? 0),
      sla_strictness_multiplier: Number(url.searchParams.get("sla_strictness_multiplier") ?? 1),
    };
    const series = await getForecastOverview(scenario);
    return NextResponse.json({
      enabled: true,
      operation_status: "success",
      series,
      confidence_band: series[0]?.confidence_band ?? "medium",
      as_of: series[0]?.as_of ?? new Date().toISOString(),
      data_latency_minutes: series[0]?.data_latency_minutes ?? 15,
      scenario_inputs: scenario,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("GET /api/forecast/overview", error);
    return NextResponse.json({ error: "Failed to load forecast overview" }, { status: 500 });
  }
}
