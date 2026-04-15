export type UsageHealthStatus = "Healthy" | "Warning" | "Near Limit" | "Limit Reached";

export type UsageValueSource =
  | "Provider direct"
  | "Calculated estimate"
  | "Configured manually"
  | "Unavailable from provider";

export type UsagePreset = "today" | "last7" | "thisMonth" | "custom";

export type UsageDateRange = {
  preset: UsagePreset;
  start: string;
  end: string;
};

export type UsageDataSourceMeta = {
  provider: "openai" | "railway";
  available: boolean;
  notes: string[];
  source: UsageValueSource;
};

export type OpenAiUsageRow = {
  date: string;
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number | null;
  budget_limit_usd: number | null;
  remaining_budget_usd: number | null;
  source: UsageValueSource;
  status: UsageHealthStatus;
};

export type OpenAiUsageTotals = {
  requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number | null;
};

export type OpenAiUsageResponse = {
  provider: "openai";
  available: boolean;
  error: string | null;
  date_range: UsageDateRange;
  current_month_start: string;
  current_month_end: string;
  monthly_budget_limit_usd: number | null;
  monthly_budget_limit_source: UsageValueSource;
  monthly_token_limit: number | null;
  monthly_token_limit_source: UsageValueSource;
  current_month_spend_usd: number | null;
  current_month_spend_source: UsageValueSource;
  remaining_budget_usd: number | null;
  remaining_budget_source: UsageValueSource;
  selected_totals: OpenAiUsageTotals;
  current_month_totals: OpenAiUsageTotals;
  daily_breakdown: Array<{
    date: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number | null;
    source: UsageValueSource;
    status: UsageHealthStatus;
  }>;
  model_breakdown: Array<{
    model: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost_usd: number | null;
    source: UsageValueSource;
  }>;
  rows: OpenAiUsageRow[];
  status: UsageHealthStatus;
  usage_percent: number | null;
  data_source: UsageDataSourceMeta;
  last_synced_at: string;
};

export type RailwayUsageRow = {
  date: string;
  scope: string;
  metric_type: string;
  usage_value: number | null;
  estimated_usage_value: number | null;
  usage_unit: string | null;
  limit_value: number | null;
  remaining_value: number | null;
  billing_period: string;
  source: UsageValueSource;
  status: UsageHealthStatus;
};

export type RailwayUsageResponse = {
  provider: "railway";
  available: boolean;
  error: string | null;
  date_range: UsageDateRange;
  current_plan: string | null;
  current_plan_source: UsageValueSource;
  billing_period_start: string;
  billing_period_end: string;
  billing_period_source: UsageValueSource;
  current_usage_usd: number | null;
  current_usage_source: UsageValueSource;
  estimated_usage_usd: number | null;
  estimated_usage_source: UsageValueSource;
  usage_limit_usd: number | null;
  usage_limit_source: UsageValueSource;
  remaining_quota_usd: number | null;
  remaining_quota_source: UsageValueSource;
  active_project: {
    id: string | null;
    name: string | null;
  };
  active_service: {
    id: string | null;
    name: string | null;
  } | null;
  service_breakdown: Array<{
    service_id: string | null;
    service_name: string;
    metrics: Array<{
      metric_type: string;
      usage_value: number | null;
      estimated_usage_value: number | null;
      usage_unit: string | null;
      source: UsageValueSource;
    }>;
  }>;
  rows: RailwayUsageRow[];
  status: UsageHealthStatus;
  usage_percent: number | null;
  data_source: UsageDataSourceMeta;
  last_synced_at: string;
};

export type UsageSummaryResponse = {
  last_synced_at: string;
  openai: Pick<
    OpenAiUsageResponse,
    | "available"
    | "error"
    | "monthly_budget_limit_usd"
    | "current_month_spend_usd"
    | "remaining_budget_usd"
    | "current_month_totals"
    | "status"
    | "usage_percent"
    | "data_source"
    | "last_synced_at"
  >;
  railway: Pick<
    RailwayUsageResponse,
    | "available"
    | "error"
    | "current_plan"
    | "current_usage_usd"
    | "estimated_usage_usd"
    | "usage_limit_usd"
    | "remaining_quota_usd"
    | "active_project"
    | "active_service"
    | "billing_period_start"
    | "billing_period_end"
    | "status"
    | "usage_percent"
    | "data_source"
    | "last_synced_at"
  >;
};
