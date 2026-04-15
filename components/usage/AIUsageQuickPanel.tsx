"use client";

import React from "react";
import useSWR from "swr";
import Link from "next/link";
import { apiFetchJson } from "@/lib/apiClient";
import { formatDateTime, formatPercent, formatTokenCount, formatUsd } from "@/lib/usage/format";
import type { UsageSummaryResponse } from "@/lib/usage/types";
import UsageStatusBadge from "@/components/usage/UsageStatusBadge";

const fetcher = (url: string) => apiFetchJson<UsageSummaryResponse>(url);

export default function AIUsageQuickPanel() {
  const { data, error, isLoading, mutate } = useSWR("/api/usage/summary", fetcher, {
    refreshInterval: 300_000,
    revalidateOnFocus: false,
  });

  if (isLoading && !data) {
    return <div className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">Loading usage summary…</div>;
  }

  if (error || !data) {
    return (
      <div className="px-3 py-3">
        <div className="text-xs font-medium text-rose-600 dark:text-rose-400">
          {(error as Error)?.message || "Usage summary is unavailable right now."}
        </div>
        <button
          type="button"
          onClick={() => void mutate()}
          className="mt-2 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100 px-3 py-3 dark:border-slate-700">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">AI Usage</div>
        <Link href="/usage" className="text-[11px] font-semibold text-blue-700 hover:underline dark:text-blue-400">
          Open dashboard
        </Link>
      </div>
      <div className="space-y-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-700 dark:bg-slate-800/70">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">OpenAI</div>
            <UsageStatusBadge status={data.openai.status} />
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1 text-[11px] text-slate-600 dark:text-slate-300">
            <div>Spend: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatUsd(data.openai.current_month_spend_usd)}</span></div>
            <div>Budget: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatUsd(data.openai.monthly_budget_limit_usd)}</span></div>
            <div>Tokens: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatTokenCount(data.openai.current_month_totals.total_tokens)}</span></div>
            <div>Usage: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatPercent(data.openai.usage_percent)}</span></div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-700 dark:bg-slate-800/70">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">Railway</div>
            <UsageStatusBadge status={data.railway.status} />
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1 text-[11px] text-slate-600 dark:text-slate-300">
            <div>Plan: <span className="font-semibold text-slate-900 dark:text-slate-100">{data.railway.current_plan || "—"}</span></div>
            <div>Current: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatUsd(data.railway.current_usage_usd)}</span></div>
            <div>Est.: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatUsd(data.railway.estimated_usage_usd)}</span></div>
            <div>Remain: <span className="font-semibold text-slate-900 dark:text-slate-100">{formatUsd(data.railway.remaining_quota_usd)}</span></div>
          </div>
        </div>
      </div>
      <div className="mt-2 text-[10px] text-slate-400">Last synced {formatDateTime(data.last_synced_at)}</div>
    </div>
  );
}
