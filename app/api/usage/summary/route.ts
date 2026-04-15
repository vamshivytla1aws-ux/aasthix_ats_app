import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { getOpenAiUsage } from "@/lib/usage/openaiUsage";
import { getRailwayUsage } from "@/lib/usage/railwayUsage";
import { getCurrentMonthRange, maybeBypassCache } from "@/lib/usage/shared";
import type { UsageSummaryResponse } from "@/lib/usage/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const url = new URL(request.url);
    const range = getCurrentMonthRange();
    const refresh = maybeBypassCache(url.searchParams);
    const [openai, railway] = await Promise.all([
      getOpenAiUsage(range, { refresh }),
      getRailwayUsage(range, { refresh }),
    ]);

    const response: UsageSummaryResponse = {
      last_synced_at: new Date().toISOString(),
      openai: {
        available: openai.available,
        error: openai.error,
        monthly_budget_limit_usd: openai.monthly_budget_limit_usd,
        current_month_spend_usd: openai.current_month_spend_usd,
        remaining_budget_usd: openai.remaining_budget_usd,
        current_month_totals: openai.current_month_totals,
        status: openai.status,
        usage_percent: openai.usage_percent,
        data_source: openai.data_source,
        last_synced_at: openai.last_synced_at,
      },
      railway: {
        available: railway.available,
        error: railway.error,
        current_plan: railway.current_plan,
        current_usage_usd: railway.current_usage_usd,
        estimated_usage_usd: railway.estimated_usage_usd,
        usage_limit_usd: railway.usage_limit_usd,
        remaining_quota_usd: railway.remaining_quota_usd,
        active_project: railway.active_project,
        active_service: railway.active_service,
        billing_period_start: railway.billing_period_start,
        billing_period_end: railway.billing_period_end,
        status: railway.status,
        usage_percent: railway.usage_percent,
        data_source: railway.data_source,
        last_synced_at: railway.last_synced_at,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("GET /api/usage/summary", error);
    return NextResponse.json({ error: "Failed to fetch usage summary." }, { status: 500 });
  }
}
