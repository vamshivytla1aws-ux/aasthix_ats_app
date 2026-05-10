import { query } from "@/lib/db";

const DEFAULT_TEMPLATE = {
  competencies: [
    { key: "technical_depth", label: "Technical depth", weight: 35 },
    { key: "problem_solving", label: "Problem solving", weight: 25 },
    { key: "communication", label: "Communication", weight: 20 },
    { key: "ownership", label: "Ownership", weight: 20 },
  ],
  rubric_scale: [1, 2, 3, 4, 5],
};

export async function getScorecardTemplate(jobId: number) {
  const res = await query(`SELECT id, job_id, template, updated_at FROM interview_scorecard_templates WHERE job_id = $1 LIMIT 1`, [jobId]);
  if (res.rowCount === 0) {
    return {
      job_id: jobId,
      template: DEFAULT_TEMPLATE,
      updated_at: null as string | null,
      source: "default" as const,
    };
  }
  const row = res.rows[0] as any;
  return {
    job_id: Number(row.job_id),
    template: row.template || DEFAULT_TEMPLATE,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    source: "saved" as const,
  };
}

export async function upsertScorecardTemplate(jobId: number, template: Record<string, unknown>, actorUserId: number) {
  const res = await query(
    `INSERT INTO interview_scorecard_templates (job_id, template, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, NOW())
     ON CONFLICT (job_id)
     DO UPDATE SET template = EXCLUDED.template, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING id, job_id, template, updated_at`,
    [jobId, JSON.stringify(template ?? DEFAULT_TEMPLATE), actorUserId]
  );
  const row = res.rows[0] as any;
  return {
    id: Number(row.id),
    job_id: Number(row.job_id),
    template: row.template || DEFAULT_TEMPLATE,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export async function createInterviewScorecard(input: {
  applicationId: number;
  interviewerUserId: number;
  roundLabel?: string | null;
  scorecard: Record<string, unknown>;
  overallRecommendation?: string | null;
}) {
  const res = await query(
    `INSERT INTO interview_scorecards
      (application_id, interviewer_user_id, round_label, scorecard, overall_recommendation, created_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, NOW())
     RETURNING id, application_id, interviewer_user_id, round_label, scorecard, overall_recommendation, created_at`,
    [
      input.applicationId,
      input.interviewerUserId,
      input.roundLabel ?? null,
      JSON.stringify(input.scorecard ?? {}),
      input.overallRecommendation ?? null,
    ]
  );
  const row = res.rows[0] as any;
  return {
    id: Number(row.id),
    application_id: Number(row.application_id),
    interviewer_user_id: row.interviewer_user_id != null ? Number(row.interviewer_user_id) : null,
    round_label: row.round_label ?? null,
    scorecard: row.scorecard ?? {},
    overall_recommendation: row.overall_recommendation ?? null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

export async function getCalibrationSummary() {
  const res = await query(
    `SELECT interviewer_user_id,
            COUNT(*)::int AS scorecard_count,
            AVG(CASE
                  WHEN lower(COALESCE(overall_recommendation, '')) = 'strong_hire' THEN 5
                  WHEN lower(COALESCE(overall_recommendation, '')) = 'hire' THEN 4
                  WHEN lower(COALESCE(overall_recommendation, '')) = 'hold' THEN 3
                  WHEN lower(COALESCE(overall_recommendation, '')) = 'reject' THEN 2
                  ELSE 3
                END)::numeric(10,2) AS recommendation_index
     FROM interview_scorecards
     GROUP BY interviewer_user_id
     ORDER BY scorecard_count DESC
     LIMIT 100`
  );
  return res.rows.map((row: any) => ({
    interviewer_user_id: row.interviewer_user_id != null ? Number(row.interviewer_user_id) : null,
    scorecard_count: Number(row.scorecard_count || 0),
    recommendation_index: Number(row.recommendation_index || 0),
  }));
}
