import type { OpenAiUsageResponse, OpenAiUsageRow, UsageValueSource } from "@/lib/usage/types";
import {
  clampRemaining,
  fmtDateOnly,
  getCached,
  getCurrentMonthRange,
  parseNumberEnv,
  setCached,
  stableNowIso,
  usagePercent,
  usageStatus,
} from "@/lib/usage/shared";

type Bucket = {
  start_time: number;
  end_time: number;
  results?: Array<{
    model?: string | null;
    input_tokens?: number;
    output_tokens?: number;
    num_model_requests?: number;
  }>;
};

type CostBucket = {
  start_time: number;
  end_time: number;
  results?: Array<{
    amount?: {
      value?: number;
      currency?: string;
    } | null;
  }>;
};

type OpenAiPrice = {
  inputPer1M: number;
  outputPer1M: number;
};

const PRICE_BOOK: Record<string, OpenAiPrice> = {
  "gpt-4o": { inputPer1M: 5, outputPer1M: 15 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4.1": { inputPer1M: 2, outputPer1M: 8 },
  "gpt-4.1-mini": { inputPer1M: 0.4, outputPer1M: 1.6 },
  "gpt-4.1-nano": { inputPer1M: 0.1, outputPer1M: 0.4 },
  "gpt-5.4": { inputPer1M: 10, outputPer1M: 30 },
  "gpt-5.4-mini": { inputPer1M: 2, outputPer1M: 8 },
  "gpt-5-mini": { inputPer1M: 0.25, outputPer1M: 2 },
  "gpt-5-nano": { inputPer1M: 0.05, outputPer1M: 0.4 },
};

function normalizeModel(model: string | null | undefined) {
  return (model || "All models").trim();
}

function findPrice(model: string) {
  const normalized = model.trim().toLowerCase();
  const direct = PRICE_BOOK[normalized];
  if (direct) return direct;
  const partial = Object.entries(PRICE_BOOK).find(([key]) => normalized.startsWith(key));
  return partial?.[1] || null;
}

async function openAiAdminFetch(path: string, params: Record<string, string>) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  const url = new URL(`https://api.openai.com/v1${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI usage API ${res.status}: ${detail || res.statusText}`);
  }
  return res.json();
}

async function getAllBuckets<T>(path: string, baseParams: Record<string, string>) {
  const all: T[] = [];
  let nextPage: string | null = null;
  do {
    const json = await openAiAdminFetch(path, {
      ...baseParams,
      ...(nextPage ? { page: nextPage } : {}),
    });
    all.push(...((json?.data as T[] | undefined) || []));
    nextPage = typeof json?.next_page === "string" ? json.next_page : null;
  } while (nextPage);
  return all;
}

function sumTotals(rows: Array<{ requests: number; input_tokens: number; output_tokens: number; total_tokens: number; cost_usd: number | null }>) {
  return rows.reduce(
    (acc, row) => {
      acc.requests += row.requests;
      acc.input_tokens += row.input_tokens;
      acc.output_tokens += row.output_tokens;
      acc.total_tokens += row.total_tokens;
      acc.cost_usd = (acc.cost_usd ?? 0) + (row.cost_usd ?? 0);
      return acc;
    },
    { requests: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0 as number | null }
  );
}

function allocateDailyCosts(
  rows: OpenAiUsageRow[],
  dailyCosts: Map<string, number | null>
): { rows: OpenAiUsageRow[]; source: UsageValueSource; notes: string[] } {
  const dayTotals = new Map<string, number>();
  for (const row of rows) {
    dayTotals.set(row.date, (dayTotals.get(row.date) || 0) + row.total_tokens);
  }

  let usedEstimate = false;
  const nextRows = rows.map((row) => {
    const dayCost = dailyCosts.get(row.date);
    if (dayCost != null) {
      const totalTokensForDay = dayTotals.get(row.date) || 0;
      const proportionalCost =
        totalTokensForDay > 0 ? (dayCost * row.total_tokens) / totalTokensForDay : dayCost;
      return {
        ...row,
        cost_usd: proportionalCost,
        source: "Calculated estimate" as UsageValueSource,
      };
    }
    const price = findPrice(row.model);
    if (!price) return row;
    usedEstimate = true;
    const estimated =
      (row.input_tokens / 1_000_000) * price.inputPer1M +
      (row.output_tokens / 1_000_000) * price.outputPer1M;
    return {
      ...row,
      cost_usd: estimated,
      source: "Calculated estimate" as UsageValueSource,
    };
  });

  const notes = [];
  if (dailyCosts.size > 0) {
    notes.push("Daily cost totals are direct from provider. Per-model row costs are allocated proportionally by token share.");
  } else if (usedEstimate) {
    notes.push("Costs are calculated estimates using built-in model pricing assumptions.");
  } else {
    notes.push("Cost details are unavailable from provider for the current key or models.");
  }

  const source: UsageValueSource =
    dailyCosts.size > 0 || usedEstimate ? "Calculated estimate" : "Unavailable from provider";

  return { rows: nextRows, source, notes };
}

export async function getOpenAiUsage(range: { start: string; end: string }, opts?: { refresh?: boolean }): Promise<OpenAiUsageResponse> {
  const cacheKey = `usage:openai:${range.start}:${range.end}`;
  if (!opts?.refresh) {
    const cached = getCached<OpenAiUsageResponse>(cacheKey);
    if (cached) return cached;
  }

  const nowIso = stableNowIso();
  const monthRange = getCurrentMonthRange();
  const budgetLimit = parseNumberEnv(process.env.OPENAI_MONTHLY_BUDGET);
  const tokenLimit = parseNumberEnv(process.env.OPENAI_MONTHLY_TOKEN_LIMIT);

  try {
    const [selectedUsageBuckets, monthUsageBuckets, selectedCostBuckets, monthCostBuckets] = await Promise.all([
      getAllBuckets<Bucket>("/organization/usage/completions", {
        start_time: String(Math.floor(new Date(range.start).getTime() / 1000)),
        end_time: String(Math.floor(new Date(range.end).getTime() / 1000)),
        bucket_width: "1d",
        "group_by[]": "model",
        limit: "31",
      }),
      getAllBuckets<Bucket>("/organization/usage/completions", {
        start_time: String(Math.floor(new Date(monthRange.start).getTime() / 1000)),
        end_time: String(Math.floor(new Date(monthRange.end).getTime() / 1000)),
        bucket_width: "1d",
        "group_by[]": "model",
        limit: "31",
      }),
      getAllBuckets<CostBucket>("/organization/costs", {
        start_time: String(Math.floor(new Date(range.start).getTime() / 1000)),
        end_time: String(Math.floor(new Date(range.end).getTime() / 1000)),
        bucket_width: "1d",
        limit: "31",
      }).catch(() => []),
      getAllBuckets<CostBucket>("/organization/costs", {
        start_time: String(Math.floor(new Date(monthRange.start).getTime() / 1000)),
        end_time: String(Math.floor(new Date(monthRange.end).getTime() / 1000)),
        bucket_width: "1d",
        limit: "31",
      }).catch(() => []),
    ]);

    const selectedDailyCostMap = new Map<string, number | null>();
    for (const bucket of selectedCostBuckets) {
      const date = fmtDateOnly(new Date(bucket.start_time * 1000).toISOString());
      const total = (bucket.results || []).reduce((sum, item) => sum + Number(item?.amount?.value || 0), 0);
      selectedDailyCostMap.set(date, Number.isFinite(total) ? total : null);
    }
    const monthDailyCostMap = new Map<string, number | null>();
    for (const bucket of monthCostBuckets) {
      const date = fmtDateOnly(new Date(bucket.start_time * 1000).toISOString());
      const total = (bucket.results || []).reduce((sum, item) => sum + Number(item?.amount?.value || 0), 0);
      monthDailyCostMap.set(date, Number.isFinite(total) ? total : null);
    }

    const baseSelectedRows: OpenAiUsageRow[] = [];
    for (const bucket of selectedUsageBuckets) {
      const date = fmtDateOnly(new Date(bucket.start_time * 1000).toISOString());
      const results = bucket.results || [];
      if (results.length === 0) {
        baseSelectedRows.push({
          date,
          model: "All models",
          requests: 0,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          cost_usd: null,
          budget_limit_usd: budgetLimit,
          remaining_budget_usd: null,
          source: "Provider direct",
          status: usageStatus(budgetLimit, 0),
        });
        continue;
      }
      for (const result of results) {
        const input = Number(result.input_tokens || 0);
        const output = Number(result.output_tokens || 0);
        baseSelectedRows.push({
          date,
          model: normalizeModel(result.model),
          requests: Number(result.num_model_requests || 0),
          input_tokens: input,
          output_tokens: output,
          total_tokens: input + output,
          cost_usd: null,
          budget_limit_usd: budgetLimit,
          remaining_budget_usd: null,
          source: "Provider direct",
          status: "Healthy",
        });
      }
    }

    const selectedAllocation = allocateDailyCosts(baseSelectedRows, selectedDailyCostMap);
    const selectedTotals = sumTotals(selectedAllocation.rows);

    const monthRows: OpenAiUsageRow[] = [];
    for (const bucket of monthUsageBuckets) {
      const date = fmtDateOnly(new Date(bucket.start_time * 1000).toISOString());
      for (const result of bucket.results || []) {
        const input = Number(result.input_tokens || 0);
        const output = Number(result.output_tokens || 0);
        monthRows.push({
          date,
          model: normalizeModel(result.model),
          requests: Number(result.num_model_requests || 0),
          input_tokens: input,
          output_tokens: output,
          total_tokens: input + output,
          cost_usd: null,
          budget_limit_usd: budgetLimit,
          remaining_budget_usd: null,
          source: "Provider direct",
          status: "Healthy",
        });
      }
    }
    const monthAllocation = allocateDailyCosts(monthRows, monthDailyCostMap);
    const currentMonthTotals = sumTotals(monthAllocation.rows);

    const remainingBudget = clampRemaining(budgetLimit, currentMonthTotals.cost_usd);
    const percent = usagePercent(budgetLimit, currentMonthTotals.cost_usd);
    const health = usageStatus(budgetLimit, currentMonthTotals.cost_usd);

    const dailyMap = new Map<
      string,
      { date: string; requests: number; input_tokens: number; output_tokens: number; total_tokens: number; cost_usd: number | null; source: UsageValueSource }
    >();
    for (const row of selectedAllocation.rows) {
      const current = dailyMap.get(row.date) || {
        date: row.date,
        requests: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        cost_usd: 0,
        source: row.source,
      };
      current.requests += row.requests;
      current.input_tokens += row.input_tokens;
      current.output_tokens += row.output_tokens;
      current.total_tokens += row.total_tokens;
      current.cost_usd = (current.cost_usd ?? 0) + (row.cost_usd ?? 0);
      current.source = row.source === "Provider direct" ? current.source : row.source;
      dailyMap.set(row.date, current);
    }

    const modelMap = new Map<
      string,
      { model: string; requests: number; input_tokens: number; output_tokens: number; total_tokens: number; cost_usd: number | null; source: UsageValueSource }
    >();
    for (const row of selectedAllocation.rows) {
      const current = modelMap.get(row.model) || {
        model: row.model,
        requests: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        cost_usd: 0,
        source: row.source,
      };
      current.requests += row.requests;
      current.input_tokens += row.input_tokens;
      current.output_tokens += row.output_tokens;
      current.total_tokens += row.total_tokens;
      current.cost_usd = (current.cost_usd ?? 0) + (row.cost_usd ?? 0);
      current.source = row.source === "Provider direct" ? current.source : row.source;
      modelMap.set(row.model, current);
    }

    const rows = selectedAllocation.rows
      .map((row) => ({
        ...row,
        remaining_budget_usd: remainingBudget,
        status: usageStatus(budgetLimit, currentMonthTotals.cost_usd),
      }))
      .sort((a, b) => (a.date === b.date ? a.model.localeCompare(b.model) : a.date.localeCompare(b.date)));

    const response: OpenAiUsageResponse = {
      provider: "openai",
      available: true,
      error: null,
      date_range: {
        preset: "custom",
        start: range.start,
        end: range.end,
      },
      current_month_start: monthRange.start,
      current_month_end: monthRange.end,
      monthly_budget_limit_usd: budgetLimit,
      monthly_budget_limit_source: budgetLimit != null ? "Configured manually" : "Unavailable from provider",
      monthly_token_limit: tokenLimit,
      monthly_token_limit_source: tokenLimit != null ? "Configured manually" : "Unavailable from provider",
      current_month_spend_usd: currentMonthTotals.cost_usd,
      current_month_spend_source:
        monthDailyCostMap.size > 0 ? "Provider direct" : monthAllocation.source,
      remaining_budget_usd: remainingBudget,
      remaining_budget_source: budgetLimit != null ? (currentMonthTotals.cost_usd != null ? "Calculated estimate" : "Unavailable from provider") : "Unavailable from provider",
      selected_totals: selectedTotals,
      current_month_totals: currentMonthTotals,
      daily_breakdown: Array.from(dailyMap.values())
        .map((day) => ({
          ...day,
          cost_usd: day.cost_usd ?? null,
          source: day.source,
          status: usageStatus(budgetLimit, currentMonthTotals.cost_usd),
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      model_breakdown: Array.from(modelMap.values()).sort((a, b) => b.total_tokens - a.total_tokens),
      rows,
      status: health,
      usage_percent: percent,
      data_source: {
        provider: "openai",
        available: true,
        source:
          selectedDailyCostMap.size > 0
            ? "Provider direct"
            : selectedAllocation.source,
        notes: [
          "Usage buckets are fetched from OpenAI organization usage endpoints.",
          ...selectedAllocation.notes,
          budgetLimit != null
            ? "Monthly budget is configured from OPENAI_MONTHLY_BUDGET."
            : "Monthly budget limit is unavailable until OPENAI_MONTHLY_BUDGET is configured.",
          tokenLimit != null
            ? "Monthly token limit is configured from OPENAI_MONTHLY_TOKEN_LIMIT."
            : "Token cap is unavailable unless OPENAI_MONTHLY_TOKEN_LIMIT is configured.",
        ],
      },
      last_synced_at: nowIso,
    };

    setCached(cacheKey, response);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch OpenAI usage.";
    const unavailable: OpenAiUsageResponse = {
      provider: "openai",
      available: false,
      error: message.includes("403") || message.includes("401")
        ? "OpenAI usage endpoints require organization-level admin access on the configured key."
        : message,
      date_range: { preset: "custom", start: range.start, end: range.end },
      current_month_start: monthRange.start,
      current_month_end: monthRange.end,
      monthly_budget_limit_usd: budgetLimit,
      monthly_budget_limit_source: budgetLimit != null ? "Configured manually" : "Unavailable from provider",
      monthly_token_limit: tokenLimit,
      monthly_token_limit_source: tokenLimit != null ? "Configured manually" : "Unavailable from provider",
      current_month_spend_usd: null,
      current_month_spend_source: "Unavailable from provider",
      remaining_budget_usd: null,
      remaining_budget_source: "Unavailable from provider",
      selected_totals: { requests: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: null },
      current_month_totals: { requests: 0, input_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: null },
      daily_breakdown: [],
      model_breakdown: [],
      rows: [],
      status: "Healthy",
      usage_percent: null,
      data_source: {
        provider: "openai",
        available: false,
        source: "Unavailable from provider",
        notes: [
          "OpenAI usage and cost data are fetched server-side only.",
          message.includes("403") || message.includes("401")
            ? "The configured OPENAI_API_KEY is missing organization admin access for usage/cost endpoints."
            : message,
        ],
      },
      last_synced_at: nowIso,
    };
    setCached(cacheKey, unavailable, 60_000);
    return unavailable;
  }
}
