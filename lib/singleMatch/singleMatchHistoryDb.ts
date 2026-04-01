import { query } from "@/lib/db";
import type { SingleMatchCheckResultPayload } from "@/lib/singleMatch/types";
import type { SingleMatchHistoryRun } from "@/lib/singleMatch/types";

function isUndefinedTable(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "42P01");
}

function clampScore(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
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
  } catch (e: unknown) {
    if (isUndefinedTable(e)) {
      console.warn("[singleMatchHistory] Table single_candidate_match_checks missing — run migration 0054");
      return null;
    }
    throw e;
  }
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

function parseStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

function toIsoTimestamp(v: unknown): string {
  if (v != null && typeof v === "object" && v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return String(v ?? "");
}

export async function listSingleMatchHistoryForJob(opts: {
  jobId: number;
  ownerUserId: number;
  limit?: number;
}): Promise<{ runs: SingleMatchHistoryRun[]; migrationRequired: boolean }> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  try {
    const res = await query(
      `
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
      WHERE h.job_id = $1 AND j.created_by_user_id = $2
      ORDER BY h.created_at DESC
      LIMIT $3
      `,
      [opts.jobId, opts.ownerUserId, limit]
    );
    const runs: SingleMatchHistoryRun[] = (res.rows as DbRow[]).map((r) => ({
      id: Number(r.id),
      job_id: Number(r.job_id),
      candidate_id: Number(r.candidate_id),
      candidate_full_name: r.candidate_full_name || "—",
      use_ai: Boolean(r.use_ai),
      match_score: Number(r.match_score) || 0,
      match_score_no_ai: r.match_score_no_ai != null ? Number(r.match_score_no_ai) : null,
      ai_match_score: r.ai_match_score != null ? Number(r.ai_match_score) : null,
      decision: r.decision,
      decision_no_ai: r.decision_no_ai,
      ai_decision: r.ai_decision,
      matched_skills: parseStringArray(r.matched_skills_json),
      missing_required_skills: parseStringArray(r.missing_required_skills_json),
      reasoning: r.reasoning,
      summary: r.summary,
      created_at: toIsoTimestamp(r.created_at),
    }));
    return { runs, migrationRequired: false };
  } catch (e: unknown) {
    if (isUndefinedTable(e)) {
      return { runs: [], migrationRequired: true };
    }
    throw e;
  }
}
