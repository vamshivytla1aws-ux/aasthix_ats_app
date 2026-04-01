/**
 * Shared types for HR Assistant: AI plan → query engine → UI.
 */

export const PIPELINE_STAGES = [
  "Applied",
  "Screening",
  "Screening Failed",
  "Interview",
  "Selected",
  "Rejected",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type HrEntity =
  | "candidates"
  | "jobs"
  | "applications"
  | "interviews"
  | "offers"
  | "analytics";

export type HrIntentKind = "query" | "action" | "clarify";

export type HrAnalyticsMetric =
  | "count"
  | "group_by_stage"
  | "trend_weekly_applications"
  | "board_totals";

export type HrFilters = {
  skills?: string[];
  experience_min_years?: number;
  experience_max_years?: number;
  location?: string;
  stage?: string;
  job_status?: string;
  search_text?: string;
  date_from?: string;
  date_to?: string;
  job_id?: number;
  candidate_id?: number;
};

export type HrActionType =
  | "move_stage"
  | "schedule_interview"
  | "update_job_status"
  | "add_job_team_member";

export type HrActionSpec = {
  type: HrActionType;
  application_id?: number;
  candidate_id?: number;
  job_id?: number;
  target_user_email?: string;
  new_stage?: string;
  interview_iso?: string;
  job_status?: string;
  team_role?: "hiring_manager" | "recruiter" | "coordinator" | "sourcer" | "observer";
};

export type HrAssistantPlan = {
  kind: HrIntentKind;
  entity: HrEntity | null;
  intent_summary: string;
  filters?: HrFilters;
  analytics?: {
    metric: HrAnalyticsMetric;
  };
  action?: HrActionSpec;
  needs_clarification?: boolean;
  clarification_question?: string;
};

export type HrDirectAction = HrActionSpec;

export type HrQuickAction = {
  id: string;
  label: string;
  action: HrDirectAction;
};

export type HrQueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  entity: HrEntity | null;
};

export type HrChartPoint = { name: string; value: number };

export type HrRelatedLink = { label: string; href: string };

export type HrAssistantReply = {
  text: string;
  plan?: HrAssistantPlan;
  result?: HrQueryResult;
  quickActions?: HrQuickAction[];
  error?: string;
  /** Rule-based hiring ops insight */
  insights?: string | null;
  /** Suggested next questions */
  suggestedFollowUps?: string[];
  /** Deep links into the ATS */
  relatedLinks?: HrRelatedLink[];
  /** When present, UI may render a bar chart (analytics) */
  chartSeries?: HrChartPoint[] | null;
};
