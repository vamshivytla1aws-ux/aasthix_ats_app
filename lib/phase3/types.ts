export type RiskConfidence = "low" | "medium" | "high";

export type RiskInsight = {
  entity_type: "application" | "job";
  entity_id: number;
  risk_type: string;
  risk_score: number;
  confidence_band: RiskConfidence;
  reason_codes: string[];
  model_version: string;
  generated_at: string;
  verification?: {
    verified: boolean;
    definition_used: string;
    timezone_used: string;
    sample_ids: number[];
    generated_at: string;
  };
};

export type AutomationRule = {
  id: number;
  key: string;
  name: string;
  description: string;
  mode: "recommend-only" | "approval-required" | "auto-execute";
  enabled: boolean;
  paused: boolean;
  config: Record<string, unknown>;
  updated_at: string;
};

export type AutomationActionResult = {
  action: string;
  entity_id?: number;
  status: "suggested" | "executed" | "skipped" | "failed";
  detail?: string;
};

export type AutomationRun = {
  id: number;
  rule_id: number | null;
  run_mode: string;
  status: string;
  scope: Record<string, unknown>;
  actions: AutomationActionResult[];
  replay_metadata: Record<string, unknown>;
  triggered_by: number | null;
  created_at: string;
  mode?: AutomationRule["mode"];
  rule_version?: string;
  trigger_source?: "simulate_api" | "execute_api" | "system";
  affected_entities?: number[];
  execution_trace_id?: string;
};

export type ForecastSeriesPoint = {
  label: string;
  value: number;
};

export type ForecastSeries = {
  key: string;
  confidence_band: RiskConfidence;
  generated_at: string;
  as_of?: string;
  data_latency_minutes?: number;
  scenario_inputs?: {
    sourcing_uplift?: number;
    recruiter_capacity_delta?: number;
    sla_strictness_multiplier?: number;
  };
  points: ForecastSeriesPoint[];
};
