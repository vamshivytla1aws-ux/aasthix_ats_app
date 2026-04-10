/**
 * Top job matches by resume ↔ JD embedding similarity (pgvector).
 * Used when candidate_job_matches is sparse but embeddings exist.
 */
import { query } from "@/lib/db";
import { scoreFromCosineDistance } from "@/lib/embeddings/pgVector";

export type SimilarJobByEmbedding = {
  job_id: number;
  title: string;
  company: string | null;
  location: string | null;
  match_score: number;
  source: "embedding";
};

export async function fetchSimilarJobsByEmbedding(
  candidateId: number,
  limit: number
): Promise<SimilarJobByEmbedding[]> {
  const ready = await query(
    `SELECT 1 FROM pg_extension WHERE extname = 'vector' LIMIT 1`
  );
  if ((ready.rowCount ?? 0) === 0) return [];

  const candEmb = await query(
    `SELECT resume_embedding IS NOT NULL AS ok FROM candidates WHERE id = $1`,
    [candidateId]
  );
  if (!candEmb.rows?.[0]?.ok) return [];

  const lim = Math.min(Math.max(1, limit), 24);

  try {
    const res = await query(
      `
      SELECT
        j.id AS job_id,
        j.title,
        j.company,
        j.location,
        (c.resume_embedding <=> ec.embedding) AS dist
      FROM candidates c
      CROSS JOIN job_embedding_cache ec
      JOIN jobs j ON j.id = ec.job_id
      WHERE c.id = $1
        AND c.resume_embedding IS NOT NULL
        AND COALESCE(j.status, '') <> 'Closed'
      ORDER BY c.resume_embedding <=> ec.embedding ASC
      LIMIT $2
      `,
      [candidateId, lim]
    );

    return res.rows.map((row: { job_id: unknown; title: unknown; company: unknown; location: unknown; dist: unknown }) => ({
      job_id: Number(row.job_id),
      title: String(row.title || ""),
      company: row.company != null ? String(row.company) : null,
      location: row.location != null ? String(row.location) : null,
      match_score: scoreFromCosineDistance(Number(row.dist)),
      source: "embedding" as const,
    }));
  } catch (e) {
    console.error("fetchSimilarJobsByEmbedding", e);
    return [];
  }
}
