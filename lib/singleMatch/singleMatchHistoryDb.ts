import { query } from "@/lib/db";
import type { SingleMatchCheckResultPayload, SingleMatchHistoryRun } from "@/lib/singleMatch/types";

function isUndefinedTable(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "42P01"
  );
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
  created_at: string;
};

function mapHistoryRuns(rows: DbRow[]): SingleMatchHistoryRun[] {
  return rows.map((row) => ({
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
    created_at: toIsoTimestamp(row.created_at),
  }));
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
    h.created_at
  FROM single_candidate_match_checks h
  JOIN candidates c ON c.id = h.candidate_id
  JOIN jobs j ON j.id = h.job_id
`;

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
  } catch (error: unknown) {
    if (isUndefinedTable(error)) {
      console.warn("[singleMatchHistory] Table single_candidate_match_checks missing - run migration 0054");
      return null;
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

  try {
    try {
      const res = await query(
        `
        ${SELECT_HISTORY_COLUMNS}
        WHERE h.job_id = $1
          AND (
            j.created_by_user_id = $2
            OR EXISTS (
              SELECT 1
              FROM job_team jt
              WHERE jt.job_id = h.job_id
                AND jt.user_id = $2
            )
          )
        ORDER BY h.created_at DESC
        LIMIT $3
        `,
        [opts.jobId, opts.ownerUserId, limit]
      );

      return { runs: mapHistoryRuns(res.rows as DbRow[]), migrationRequired: false };
    } catch (error: unknown) {
      if (!isUndefinedTable(error)) throw error;

      const res = await query(
        `
        ${SELECT_HISTORY_COLUMNS}
        WHERE h.job_id = $1
          AND j.created_by_user_id = $2
        ORDER BY h.created_at DESC
        LIMIT $3
        `,
        [opts.jobId, opts.ownerUserId, limit]
      );

      return { runs: mapHistoryRuns(res.rows as DbRow[]), migrationRequired: false };
    }
  } catch (error: unknown) {
    if (isUndefinedTable(error)) {
      return { runs: [], migrationRequired: true };
    }
    throw error;
  }
}
