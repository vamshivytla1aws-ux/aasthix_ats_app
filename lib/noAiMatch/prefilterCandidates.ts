/**
 * Stage-1 PostgreSQL prefilter for No-AI matching (no vectors / no AI).
 */
import { query } from "@/lib/db";
import type { JdPrefilterSignals } from "@/lib/noAiMatch/jdPrefilter";

export type PrefilterRow = {
  id: number;
  resume_text: string | null;
  full_name: string;
  skills: string | null;
};

const PREFILTER_CAP = 150;
const PYTHON_MAX = 60;

/** Fallback: recent candidates when overlap is empty */
const FALLBACK_LIMIT = 50;

/**
 * Returns up to `limit` candidate ids (default 150) ordered by skill overlap, experience, title hint.
 * When total pool <= 100, returns all ids (caller sends all to Python, capped at 60).
 */
export async function prefilterCandidateIdsForJob(opts: {
  signals: JdPrefilterSignals;
  poolIds: number[];
}): Promise<{ ids: number[]; usedPrefilter: boolean; poolTotal: number }> {
  const { signals, poolIds } = opts;
  const poolTotal = poolIds.length;
  if (poolTotal === 0) {
    return { ids: [], usedPrefilter: false, poolTotal: 0 };
  }

  if (poolTotal <= 100) {
    return { ids: poolIds.slice(0, PYTHON_MAX), usedPrefilter: false, poolTotal };
  }

  const jdArr = signals.jd_skill_tokens.length ? signals.jd_skill_tokens : [];
  const minY = signals.min_years;
  const titleKw = signals.title_keywords[0] || "";

  const res = await query(
    `
    WITH pool AS (
      SELECT UNNEST($1::bigint[]) AS id
    ),
    scored AS (
      SELECT
        c.id,
        c.resume_text,
        COALESCE(c.normalized_skills, ARRAY[]::text[]) AS ns,
        COALESCE(c.years_experience, 0::numeric) AS yexp,
        COALESCE(c.normalized_title, '') AS ntitle,
        COALESCE(c.profile_last_computed_at, c.created_at) AS recency,
        (
          SELECT COUNT(*)::int
          FROM UNNEST(COALESCE(c.normalized_skills, ARRAY[]::text[])) AS s(skill)
          WHERE array_length($2::text[], 1) IS NOT NULL
            AND array_length($2::text[], 1) > 0
            AND skill = ANY($2::text[])
        ) AS skill_overlap,
        CASE
          WHEN $3::numeric IS NULL THEN 1
          WHEN c.years_experience IS NULL THEN 0.5
          WHEN c.years_experience >= $3::numeric THEN 1
          WHEN c.years_experience >= $3::numeric * 0.6 THEN 0.7
          ELSE 0.3
        END AS exp_fit,
        CASE
          WHEN LENGTH(TRIM($4::text)) < 2 THEN 0.5
          WHEN c.normalized_title IS NULL THEN 0.3
          WHEN c.normalized_title ILIKE '%' || TRIM($4::text) || '%' THEN 1
          ELSE 0.4
        END AS title_fit
      FROM candidates c
      INNER JOIN pool p ON p.id = c.id
    )
    SELECT s.id, s.resume_text
    FROM scored s
    ORDER BY
      (s.skill_overlap * 3 + s.exp_fit + s.title_fit) DESC,
      s.recency DESC NULLS LAST,
      s.id ASC
    LIMIT $5
    `,
    [poolIds, jdArr, minY, titleKw || " ", PREFILTER_CAP]
  );

  let ids = (res.rows as { id: number }[]).map((r) => Number(r.id));

  if (ids.length === 0) {
    const fb = await query(
      `
      SELECT c.id
      FROM candidates c
      WHERE c.id = ANY($1::bigint[])
      ORDER BY c.created_at DESC NULLS LAST, c.id DESC
      LIMIT $2
      `,
      [poolIds, FALLBACK_LIMIT]
    );
    ids = (fb.rows as { id: number }[]).map((r) => Number(r.id));
  }

  return {
    ids: ids.slice(0, PYTHON_MAX),
    usedPrefilter: true,
    poolTotal,
  };
}

export async function fetchCandidatePayloadRows(ids: number[]): Promise<PrefilterRow[]> {
  if (ids.length === 0) return [];
  const res = await query(
    `
    SELECT c.id, c.resume_text, c.full_name, c.skills
    FROM candidates c
    WHERE c.id = ANY($1::bigint[])
    ORDER BY array_position($1::bigint[], c.id::bigint)
    `,
    [ids]
  );
  return res.rows as PrefilterRow[];
}

export { PYTHON_MAX };
