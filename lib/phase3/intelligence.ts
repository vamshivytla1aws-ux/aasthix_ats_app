import { query } from "@/lib/db";
import type { RiskInsight } from "@/lib/phase3/types";
import { ATS_TIMEZONE } from "@/lib/timezones";

const MODEL_VERSION = "heuristic-v1";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function confidenceFromScore(score: number): "low" | "medium" | "high" {
  if (score >= 75) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function hoursAgo(value: string | null | undefined) {
  if (!value) return 999;
  const dt = new Date(value).getTime();
  if (!Number.isFinite(dt)) return 999;
  return Math.max(0, (Date.now() - dt) / (1000 * 60 * 60));
}

export async function recomputeApplicationRisks(limit = 1000) {
  const apps = await query(
    `SELECT id, stage, updated_at, interview_datetime, interview_no_show, interview_substatus
     FROM applications
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit]
  );

  for (const row of apps.rows as Array<{
    id: number;
    stage: string | null;
    updated_at: string;
    interview_datetime: string | null;
    interview_no_show: boolean | null;
    interview_substatus: string | null;
  }>) {
    const staleHours = hoursAgo(row.updated_at);
    const interviewEtaHours = row.interview_datetime ? Math.abs(hoursAgo(row.interview_datetime)) : 999;
    const reasons: string[] = [];
    let dropoffScore = 25;
    let noShowScore = 20;
    let slaScore = 20;

    if (staleHours > 72) {
      dropoffScore += 20;
      slaScore += 30;
      reasons.push("stage_stale_over_72h");
    }
    if (staleHours > 168) {
      dropoffScore += 20;
      slaScore += 20;
      reasons.push("stage_stale_over_7d");
    }
    if (row.stage === "Interview") {
      noShowScore += 20;
      reasons.push("in_interview_stage");
      if (interviewEtaHours <= 24) {
        noShowScore += 15;
        reasons.push("interview_within_24h");
      }
    }
    if (row.interview_no_show || row.interview_substatus === "no_show") {
      noShowScore += 35;
      reasons.push("prior_no_show_signal");
    }
    if (row.stage === "Applied" && staleHours > 48) {
      dropoffScore += 15;
      reasons.push("applied_without_progress");
    }

    const records = [
      { type: "application_dropoff_risk", score: clampScore(dropoffScore) },
      { type: "interview_no_show_risk", score: clampScore(noShowScore) },
      { type: "stage_sla_breach_risk", score: clampScore(slaScore) },
    ];

    for (const record of records) {
      await query(
        `INSERT INTO application_risk_insights
          (application_id, risk_type, risk_score, confidence_band, reason_codes, model_version, generated_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())
         ON CONFLICT (application_id, risk_type)
         DO UPDATE SET
           risk_score = EXCLUDED.risk_score,
           confidence_band = EXCLUDED.confidence_band,
           reason_codes = EXCLUDED.reason_codes,
           model_version = EXCLUDED.model_version,
           generated_at = NOW()`,
        [row.id, record.type, record.score, confidenceFromScore(record.score), JSON.stringify(reasons.slice(0, 8)), MODEL_VERSION]
      );
    }
  }
}

export async function recomputeJobRisks(limit = 500) {
  const jobs = await query(
    `SELECT j.id,
            COUNT(a.id)::int AS total_apps,
            COUNT(*) FILTER (WHERE a.stage = 'Selected')::int AS selected_count,
            COUNT(*) FILTER (WHERE a.stage = 'Interview')::int AS interview_count,
            MIN(a.updated_at) AS oldest_app_update
     FROM jobs j
     LEFT JOIN applications a ON a.job_id = j.id
     GROUP BY j.id
     ORDER BY j.id DESC
     LIMIT $1`,
    [limit]
  );

  for (const row of jobs.rows as Array<{
    id: number;
    total_apps: number;
    selected_count: number;
    interview_count: number;
    oldest_app_update: string | null;
  }>) {
    let score = 20;
    const reasons: string[] = [];
    if (row.total_apps < 3) {
      score += 25;
      reasons.push("low_application_volume");
    }
    if (row.selected_count === 0 && row.interview_count > 3) {
      score += 25;
      reasons.push("interviews_without_selection");
    }
    if (hoursAgo(row.oldest_app_update) > 240) {
      score += 20;
      reasons.push("oldest_application_stale");
    }

    const riskScore = clampScore(score);
    await query(
      `INSERT INTO job_risk_insights
        (job_id, risk_type, risk_score, confidence_band, reason_codes, model_version, generated_at)
       VALUES ($1, 'job_fill_delay_risk', $2, $3, $4::jsonb, $5, NOW())
       ON CONFLICT (job_id, risk_type)
       DO UPDATE SET
         risk_score = EXCLUDED.risk_score,
         confidence_band = EXCLUDED.confidence_band,
         reason_codes = EXCLUDED.reason_codes,
         model_version = EXCLUDED.model_version,
         generated_at = NOW()`,
      [row.id, riskScore, confidenceFromScore(riskScore), JSON.stringify(reasons.slice(0, 8)), MODEL_VERSION]
    );
  }
}

export async function getApplicationRisks(applicationId?: number): Promise<RiskInsight[]> {
  const res = await query(
    `SELECT application_id, risk_type, risk_score, confidence_band, reason_codes, model_version, generated_at
     FROM application_risk_insights
     ${applicationId ? "WHERE application_id = $1" : ""}
     ORDER BY generated_at DESC
     LIMIT 500`,
    applicationId ? [applicationId] : []
  );
  return res.rows.map((row: any) => ({
    entity_type: "application",
    entity_id: Number(row.application_id),
    risk_type: String(row.risk_type),
    risk_score: Number(row.risk_score),
    confidence_band: row.confidence_band,
    reason_codes: Array.isArray(row.reason_codes) ? row.reason_codes : [],
    model_version: String(row.model_version || MODEL_VERSION),
    generated_at: row.generated_at ? new Date(row.generated_at).toISOString() : new Date().toISOString(),
    verification: {
      verified: true,
      definition_used: "Application risk based on stage/interview signals and freshness (heuristic-v1)",
      timezone_used: ATS_TIMEZONE,
      sample_ids: [Number(row.application_id)].filter(Number.isFinite),
      generated_at: row.generated_at ? new Date(row.generated_at).toISOString() : new Date().toISOString(),
    },
  }));
}

export async function getJobRisks(jobId?: number): Promise<RiskInsight[]> {
  const res = await query(
    `SELECT job_id, risk_type, risk_score, confidence_band, reason_codes, model_version, generated_at
     FROM job_risk_insights
     ${jobId ? "WHERE job_id = $1" : ""}
     ORDER BY generated_at DESC
     LIMIT 500`,
    jobId ? [jobId] : []
  );
  return res.rows.map((row: any) => ({
    entity_type: "job",
    entity_id: Number(row.job_id),
    risk_type: String(row.risk_type),
    risk_score: Number(row.risk_score),
    confidence_band: row.confidence_band,
    reason_codes: Array.isArray(row.reason_codes) ? row.reason_codes : [],
    model_version: String(row.model_version || MODEL_VERSION),
    generated_at: row.generated_at ? new Date(row.generated_at).toISOString() : new Date().toISOString(),
    verification: {
      verified: true,
      definition_used: "Job fill-delay risk based on volume/interview/selection/staleness signals (heuristic-v1)",
      timezone_used: ATS_TIMEZONE,
      sample_ids: [Number(row.job_id)].filter(Number.isFinite),
      generated_at: row.generated_at ? new Date(row.generated_at).toISOString() : new Date().toISOString(),
    },
  }));
}

export async function getIntelligenceSummary() {
  const [appRisks, jobRisks] = await Promise.all([getApplicationRisks(), getJobRisks()]);
  const topApplication = [...appRisks].sort((a, b) => b.risk_score - a.risk_score).slice(0, 10);
  const topJob = [...jobRisks].sort((a, b) => b.risk_score - a.risk_score).slice(0, 10);
  return {
    verification: {
      verified: true,
      definition_used: "Top risks are derived from latest persisted insights (application_risk_insights/job_risk_insights)",
      timezone_used: ATS_TIMEZONE,
      sample_ids: topApplication.slice(0, 5).map((item) => item.entity_id),
      generated_at: new Date().toISOString(),
    },
    totals: {
      application_risks: appRisks.length,
      job_risks: jobRisks.length,
      high_risk_applications: appRisks.filter((item) => item.risk_score >= 75).length,
      high_risk_jobs: jobRisks.filter((item) => item.risk_score >= 75).length,
    },
    top_application_risks: topApplication,
    top_job_risks: topJob,
    model_version: MODEL_VERSION,
    generated_at: new Date().toISOString(),
  };
}
