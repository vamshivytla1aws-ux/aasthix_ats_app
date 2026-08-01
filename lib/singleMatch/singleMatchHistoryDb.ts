import { query } from "@/lib/db";
import type { SingleMatchCheckResultPayload, SingleMatchHistoryRun } from "@/lib/singleMatch/types";

function hasDbCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === code);
}

function isUndefinedTable(error: unknown): boolean {
  return hasDbCode(error, "42P01");
}

function isUndefinedColumn(error: unknown): boolean {
  return hasDbCode(error, "42703");
}

function clampScore(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return String(value ?? "");
}

function buildAdvancedInsightsJson(result: SingleMatchCheckResultPayload): Record<string, unknown> {
  return {
    resume_source: result.resume_source ?? null,
    resume_chars_scored: result.resume_chars_scored ?? null,
    jd_chars_scored: result.jd_chars_scored ?? null,
    ai_evidence_highlights: result.ai_evidence_highlights ?? [],
    requirement_breakdown: result.requirement_breakdown ?? [],
    confidence_score: result.confidence_score ?? null,
    confidence_reasons: result.confidence_reasons ?? [],
    resume_quality_flags: result.resume_quality_flags ?? [],
    decision_drivers: result.decision_drivers ?? [],
    risk_flags: result.risk_flags ?? [],
    interview_focus_areas: result.interview_focus_areas ?? [],
    follow_up_questions: result.follow_up_questions ?? [],
    recommended_next_step: result.recommended_next_step ?? null,
    evidence_quality: result.evidence_quality ?? null,
    fit_level: result.fit_level ?? null,
    score_breakdown: result.score_breakdown ?? null,
    partial_matches: result.partial_matches ?? [],
    missing_nice_to_have_requirements: result.missing_nice_to_have_requirements ?? [],
    critical_unknowns: result.critical_unknowns ?? [],
    red_flags: result.red_flags ?? [],
    recruiter_summary: result.recruiter_summary ?? null,
    candidate_feedback: result.candidate_feedback ?? null,
    model_used: result.model_used ?? null,
    fallback_review_used: result.fallback_review_used ?? false,
    resume_recovery_attempted: result.resume_recovery_attempted ?? false,
    resume_recovery_succeeded: result.resume_recovery_succeeded ?? false,
    resume_recovery_reason: result.resume_recovery_reason ?? null,
    resume_source_before_recovery: result.resume_source_before_recovery ?? null,
    resume_source_after_recovery: result.resume_source_after_recovery ?? null,
    debug_requirements: result.debug_requirements ?? [],
    developer_debug: result.developer_debug ?? null,
  };
}

type DbRow = {
  id: string | number;
  job_id: string | number;
  candidate_id: string | number;
  candidate_full_name: string;
  use_ai: boolean;
  match_score: number;
  match_score_no_ai: number | null;
  ai_match_score: number | null;
  decision: string | null;
  decision_no_ai: string | null;
  ai_decision: string | null;
  matched_skills_json: unknown;
  missing_required_skills_json: unknown;
  reasoning: string | null;
  summary: string | null;
  advanced_insights_json?: unknown;
  created_at: string;
};

function mapHistoryRuns(rows: DbRow[]): SingleMatchHistoryRun[] {
  return rows.map((row) => {
    const advanced =
      row.advanced_insights_json && typeof row.advanced_insights_json === "object"
        ? (row.advanced_insights_json as Record<string, unknown>)
        : {};

    return {
      id: Number(row.id),
      job_id: Number(row.job_id),
      candidate_id: Number(row.candidate_id),
      candidate_full_name: row.candidate_full_name || "—",
      use_ai: Boolean(row.use_ai),
      match_score: Number(row.match_score) || 0,
      match_score_no_ai: row.match_score_no_ai != null ? Number(row.match_score_no_ai) : null,
      ai_match_score: row.ai_match_score != null ? Number(row.ai_match_score) : null,
      decision: row.decision,
      decision_no_ai: row.decision_no_ai,
      ai_decision: row.ai_decision,
      matched_skills: parseStringArray(row.matched_skills_json),
      missing_required_skills: parseStringArray(row.missing_required_skills_json),
      reasoning: row.reasoning,
      summary: row.summary,
      resume_source: (advanced.resume_source as SingleMatchHistoryRun["resume_source"]) ?? undefined,
      resume_chars_scored:
        advanced.resume_chars_scored != null ? Number(advanced.resume_chars_scored) || 0 : undefined,
      jd_chars_scored: advanced.jd_chars_scored != null ? Number(advanced.jd_chars_scored) || 0 : undefined,
      ai_evidence_highlights: parseStringArray(advanced.ai_evidence_highlights),
      requirement_breakdown: Array.isArray(advanced.requirement_breakdown)
        ? (advanced.requirement_breakdown as SingleMatchHistoryRun["requirement_breakdown"])
        : undefined,
      confidence_score: advanced.confidence_score != null ? Number(advanced.confidence_score) || 0 : undefined,
      confidence_reasons: parseStringArray(advanced.confidence_reasons),
      resume_quality_flags: parseStringArray(advanced.resume_quality_flags),
      decision_drivers: parseStringArray(advanced.decision_drivers),
      risk_flags: parseStringArray(advanced.risk_flags),
      interview_focus_areas: parseStringArray(advanced.interview_focus_areas),
      follow_up_questions: parseStringArray(advanced.follow_up_questions),
      recommended_next_step:
        typeof advanced.recommended_next_step === "string" ? advanced.recommended_next_step : undefined,
      evidence_quality:
        typeof advanced.evidence_quality === "string"
          ? (advanced.evidence_quality as SingleMatchHistoryRun["evidence_quality"])
          : undefined,
      fit_level: typeof advanced.fit_level === "string" ? (advanced.fit_level as SingleMatchHistoryRun["fit_level"]) : undefined,
      score_breakdown:
        advanced.score_breakdown && typeof advanced.score_breakdown === "object"
          ? (advanced.score_breakdown as SingleMatchHistoryRun["score_breakdown"])
          : undefined,
      partial_matches: parseStringArray(advanced.partial_matches),
      missing_nice_to_have_requirements: parseStringArray(advanced.missing_nice_to_have_requirements),
      critical_unknowns: parseStringArray(advanced.critical_unknowns),
      red_flags: parseStringArray(advanced.red_flags),
      recruiter_summary: typeof advanced.recruiter_summary === "string" ? advanced.recruiter_summary : undefined,
      candidate_feedback: typeof advanced.candidate_feedback === "string" ? advanced.candidate_feedback : undefined,
      model_used: typeof advanced.model_used === "string" ? advanced.model_used : undefined,
      fallback_review_used: advanced.fallback_review_used != null ? Boolean(advanced.fallback_review_used) : undefined,
      resume_recovery_attempted: advanced.resume_recovery_attempted != null ? Boolean(advanced.resume_recovery_attempted) : undefined,
      resume_recovery_succeeded: advanced.resume_recovery_succeeded != null ? Boolean(advanced.resume_recovery_succeeded) : undefined,
      resume_recovery_reason: typeof advanced.resume_recovery_reason === "string" ? advanced.resume_recovery_reason : undefined,
      resume_source_before_recovery:
        typeof advanced.resume_source_before_recovery === "string"
          ? (advanced.resume_source_before_recovery as SingleMatchHistoryRun["resume_source"])
          : undefined,
      resume_source_after_recovery:
        typeof advanced.resume_source_after_recovery === "string"
          ? (advanced.resume_source_after_recovery as SingleMatchHistoryRun["resume_source"])
          : undefined,
      debug_requirements: Array.isArray(advanced.debug_requirements)
        ? (advanced.debug_requirements as SingleMatchHistoryRun["debug_requirements"])
        : undefined,
      developer_debug:
        advanced.developer_debug && typeof advanced.developer_debug === "object"
          ? (advanced.developer_debug as SingleMatchHistoryRun["developer_debug"])
          : undefined,
      created_at: toIsoTimestamp(row.created_at),
    };
  });
}

const SELECT_HISTORY_COLUMNS = `
  SELECT
    h.id,
    h.job_id,
    h.candidate_id,
    c.full_name AS candidate_full_name,
    h.use_ai,
    h.match_score,
    h.match_score_no_ai,
    h.ai_match_score,
    h.decision,
    h.decision_no_ai,
    h.ai_decision,
    h.matched_skills_json,
    h.missing_required_skills_json,
    h.reasoning,
    h.summary,
    COALESCE(h.advanced_insights_json, '{}'::jsonb) AS advanced_insights_json,
    h.created_at
  FROM single_candidate_match_checks h
  JOIN candidates c ON c.id = h.candidate_id
  JOIN jobs j ON j.id = h.job_id
`;

const SELECT_HISTORY_COLUMNS_LEGACY = `
  SELECT
    h.id,
    h.job_id,
    h.candidate_id,
    c.full_name AS candidate_full_name,
    h.use_ai,
    h.match_score,
    h.match_score_no_ai,
    h.ai_match_score,
    h.decision,
    h.decision_no_ai,
    h.ai_decision,
    h.matched_skills_json,
    h.missing_required_skills_json,
    h.reasoning,
    h.summary,
    h.created_at
  FROM single_candidate_match_checks h
  JOIN candidates c ON c.id = h.candidate_id
  JOIN jobs j ON j.id = h.job_id
`;

async function insertSingleMatchHistoryLegacy(opts: {
  jobId: number;
  candidateId: number;
  createdByUserId: number;
  useAi: boolean;
  result: SingleMatchCheckResultPayload;
}): Promise<{ id: number } | null> {
  const { jobId, candidateId, createdByUserId, useAi, result } = opts;
  const res = await query(
    `
    INSERT INTO single_candidate_match_checks (
      job_id,
      candidate_id,
      created_by_user_id,
      use_ai,
      match_score,
      match_score_no_ai,
      ai_match_score,
      decision,
      decision_no_ai,
      ai_decision,
      matched_skills_json,
      missing_required_skills_json,
      reasoning,
      summary
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14)
    RETURNING id
    `,
    [
      jobId,
      candidateId,
      createdByUserId,
      useAi,
      clampScore(result.match_score) ?? 0,
      clampScore(result.match_score_no_ai),
      clampScore(result.ai_match_score),
      result.decision,
      result.decision_no_ai,
      result.ai_decision,
      JSON.stringify(result.matched_skills ?? []),
      JSON.stringify(result.missing_required_skills ?? []),
      result.reasoning,
      result.summary,
    ]
  );
  const id = Number((res.rows[0] as { id: string | number }).id);
  return Number.isFinite(id) ? { id } : null;
}

export async function insertSingleMatchHistory(opts: {
  jobId: number;
  candidateId: number;
  createdByUserId: number;
  useAi: boolean;
  result: SingleMatchCheckResultPayload;
}): Promise<{ id: number } | null> {
  const { jobId, candidateId, createdByUserId, useAi, result } = opts;

  try {
    const res = await query(
      `
      INSERT INTO single_candidate_match_checks (
        job_id,
        candidate_id,
        created_by_user_id,
        use_ai,
        match_score,
        match_score_no_ai,
        ai_match_score,
        decision,
        decision_no_ai,
        ai_decision,
        matched_skills_json,
        missing_required_skills_json,
        reasoning,
        summary,
        advanced_insights_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $14, $15::jsonb)
      RETURNING id
      `,
      [
        jobId,
        candidateId,
        createdByUserId,
        useAi,
        clampScore(result.match_score) ?? 0,
        clampScore(result.match_score_no_ai),
        clampScore(result.ai_match_score),
        result.decision,
        result.decision_no_ai,
        result.ai_decision,
        JSON.stringify(result.matched_skills ?? []),
        JSON.stringify(result.missing_required_skills ?? []),
        result.reasoning,
        result.summary,
        JSON.stringify(buildAdvancedInsightsJson(result)),
      ]
    );

    const id = Number((res.rows[0] as { id: string | number }).id);
    return Number.isFinite(id) ? { id } : null;
  } catch (error: unknown) {
    if (isUndefinedTable(error)) {
      console.warn("[singleMatchHistory] Table single_candidate_match_checks missing - run migration 0054");
      return null;
    }
    if (isUndefinedColumn(error)) {
      console.warn("[singleMatchHistory] advanced_insights_json missing - save history will fall back to legacy columns until migration 0088 is applied");
      return insertSingleMatchHistoryLegacy(opts);
    }
    throw error;
  }
}

export async function listSingleMatchHistoryForJob(opts: {
  jobId: number;
  ownerUserId: number;
  limit?: number;
}): Promise<{ runs: SingleMatchHistoryRun[]; migrationRequired: boolean }> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  void opts.ownerUserId;

  try {
    const res = await query(
      `
      ${SELECT_HISTORY_COLUMNS}
      WHERE h.job_id = $1
      ORDER BY h.created_at DESC
      LIMIT $2
      `,
      [opts.jobId, limit]
    );

    return { runs: mapHistoryRuns(res.rows as DbRow[]), migrationRequired: false };
  } catch (error: unknown) {
    if (isUndefinedTable(error)) {
      return { runs: [], migrationRequired: true };
    }
    if (isUndefinedColumn(error)) {
      const res = await query(
        `
        ${SELECT_HISTORY_COLUMNS_LEGACY}
        WHERE h.job_id = $1
        ORDER BY h.created_at DESC
        LIMIT $2
        `,
        [opts.jobId, limit]
      );
      return { runs: mapHistoryRuns(res.rows as DbRow[]), migrationRequired: false };
    }
    throw error;
  }
}
