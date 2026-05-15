import { query } from "@/lib/db";
import type { ForecastSeries } from "@/lib/phase3/types";

type ForecastScenarioInputs = {
  sourcing_uplift?: number;
  recruiter_capacity_delta?: number;
  sla_strictness_multiplier?: number;
};

function toIso(value: unknown) {
  if (!value) return new Date().toISOString();
  const dt = new Date(String(value));
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : new Date().toISOString();
}

function normScenario(input?: ForecastScenarioInputs): Required<ForecastScenarioInputs> {
  const sourcing = Number(input?.sourcing_uplift ?? 0);
  const capDelta = Number(input?.recruiter_capacity_delta ?? 0);
  const sla = Number(input?.sla_strictness_multiplier ?? 1);
  return {
    sourcing_uplift: Number.isFinite(sourcing) ? sourcing : 0,
    recruiter_capacity_delta: Number.isFinite(capDelta) ? capDelta : 0,
    sla_strictness_multiplier: Number.isFinite(sla) && sla > 0 ? sla : 1,
  };
}

export async function getForecastOverview(scenario?: ForecastScenarioInputs): Promise<ForecastSeries[]> {
  const scenarioInputs = normScenario(scenario);
  const now = new Date();
  const rows = await query(
    `SELECT
      COUNT(*) FILTER (WHERE stage = 'Interview')::int AS interview_count,
      COUNT(*) FILTER (WHERE stage = 'Selected')::int AS selected_count,
      COUNT(*) FILTER (WHERE stage = 'Applied')::int AS applied_count
     FROM applications`
  );
  const r = rows.rows[0] as { interview_count: number; selected_count: number; applied_count: number };
  const upliftFactor = 1 + scenarioInputs.sourcing_uplift / 100;
  const capFactor = 1 + scenarioInputs.recruiter_capacity_delta / 100;
  const slaFactor = Math.max(0.6, Math.min(1.4, 2 - scenarioInputs.sla_strictness_multiplier));
  const forecastFactor = upliftFactor * capFactor * slaFactor;
  return [
    {
      key: "expected_interviews",
      confidence_band: "medium",
      generated_at: now.toISOString(),
      as_of: now.toISOString(),
      data_latency_minutes: 15,
      scenario_inputs: scenarioInputs,
      points: [
        { label: "7d", value: Math.max(0, Math.round((r.interview_count || 0) * 0.4 * forecastFactor)) },
        { label: "14d", value: Math.max(0, Math.round((r.interview_count || 0) * 0.75 * forecastFactor)) },
        { label: "30d", value: Math.max(0, Math.round((r.interview_count || 0) * 1.5 * forecastFactor)) },
      ],
    },
    {
      key: "expected_selections",
      confidence_band: "medium",
      generated_at: now.toISOString(),
      as_of: now.toISOString(),
      data_latency_minutes: 15,
      scenario_inputs: scenarioInputs,
      points: [
        {
          label: "7d",
          value: Math.max(0, Math.round(((r.selected_count || 0) * 0.35 + (r.interview_count || 0) * 0.08) * forecastFactor)),
        },
        {
          label: "14d",
          value: Math.max(0, Math.round(((r.selected_count || 0) * 0.7 + (r.interview_count || 0) * 0.15) * forecastFactor)),
        },
        {
          label: "30d",
          value: Math.max(0, Math.round(((r.selected_count || 0) * 1.3 + (r.interview_count || 0) * 0.3) * forecastFactor)),
        },
      ],
    },
  ];
}

export async function getForecastCapacity(scenario?: ForecastScenarioInputs) {
  const scenarioInputs = normScenario(scenario);
  const res = await query(
    `SELECT u.id,
            u.full_name,
            COUNT(a.id)::int AS active_load
     FROM users u
     LEFT JOIN applications a ON a.assigned_recruiter_user_id = u.id AND a.stage IN ('Applied','Screening','Interview')
     GROUP BY u.id, u.full_name
     ORDER BY active_load DESC, u.full_name ASC
     LIMIT 50`
  );
  const rows = res.rows.map((row: any) => {
    const load = Number(row.active_load || 0);
    const recommended = Math.max(6, Math.round(load * (0.85 + scenarioInputs.recruiter_capacity_delta / 100)));
    return {
      recruiter_id: Number(row.id),
      recruiter_name: String(row.full_name || `User ${row.id}`),
      active_load: load,
      recommended_capacity: recommended,
      load_delta: load - recommended,
    };
  });
  return {
    generated_at: new Date().toISOString(),
    as_of: new Date().toISOString(),
    confidence_band: "medium" as const,
    data_latency_minutes: 15,
    scenario_inputs: scenarioInputs,
    rows,
  };
}

export async function getForecastFillDates(scenario?: ForecastScenarioInputs) {
  const scenarioInputs = normScenario(scenario);
  const res = await query(
    `SELECT j.id, j.title,
            COUNT(a.id)::int AS total_apps,
            COUNT(*) FILTER (WHERE a.stage = 'Interview')::int AS interview_count,
            COUNT(*) FILTER (WHERE a.stage = 'Selected')::int AS selected_count,
            MIN(a.updated_at) AS oldest_update
     FROM jobs j
     LEFT JOIN applications a ON a.job_id = j.id
     GROUP BY j.id, j.title
     ORDER BY j.id DESC
     LIMIT 100`
  );
  const rows = res.rows.map((row: any) => {
    const today = new Date();
    const baseLag = Math.max(5, 35 - Number(row.interview_count || 0) * 2 - Number(row.selected_count || 0) * 5);
    const adjustedLag = Math.max(
      3,
      Math.round(baseLag * Math.max(0.6, Math.min(1.5, scenarioInputs.sla_strictness_multiplier)) * (1 - scenarioInputs.sourcing_uplift / 250))
    );
    const projected = new Date(today.getTime() + adjustedLag * 24 * 60 * 60 * 1000);
    return {
      job_id: Number(row.id),
      job_title: String(row.title || `Job ${row.id}`),
      total_apps: Number(row.total_apps || 0),
      interview_count: Number(row.interview_count || 0),
      selected_count: Number(row.selected_count || 0),
      oldest_update: toIso(row.oldest_update),
      projected_fill_date: projected.toISOString(),
      confidence_band: Number(row.interview_count || 0) >= 3 ? "medium" : "low",
      scenario_inputs: scenarioInputs,
    };
  });
  return {
    generated_at: new Date().toISOString(),
    as_of: new Date().toISOString(),
    data_latency_minutes: 15,
    scenario_inputs: scenarioInputs,
    rows,
  };
}
