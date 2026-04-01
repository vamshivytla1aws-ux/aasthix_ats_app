import { query } from "@/lib/db";
import { createEmbedding, EMBEDDING_MODEL } from "@/lib/embeddings/openaiEmbeddings";
import { toPgVectorLiteral } from "@/lib/embeddings/pgVector";
import { resolveCandidateResumeTextForMatch, type CandidateRowForMatch } from "@/lib/candidateResumeForMatch";

/**
 * Recompute and store `candidates.resume_embedding` after resume/skills change.
 * No-op if column missing or OPENAI_API_KEY unset.
 */
export async function refreshResumeEmbeddingForCandidate(candidateId: number, userId: number): Promise<void> {
  if (process.env.OPENAI_API_KEY == null || process.env.OPENAI_API_KEY === "") return;

  try {
    const res = await query(
      `
      SELECT id, full_name, skills, location, resume_url, resume_text, experience_summary, skillset
      FROM candidates
      WHERE id = $1 AND created_by_user_id = $2
      LIMIT 1
      `,
      [candidateId, userId]
    );
    const row = res.rows[0] as (CandidateRowForMatch & { id: number }) | undefined;
    if (!row) return;

    const text = await resolveCandidateResumeTextForMatch(row, new Map());
    const vec = await createEmbedding(text);
    const lit = toPgVectorLiteral(vec);

    await query(
      `UPDATE candidates SET
         resume_embedding = $1::vector,
         resume_embedding_updated_at = NOW(),
         resume_embedding_model = $2
       WHERE id = $3 AND created_by_user_id = $4`,
      [lit, EMBEDDING_MODEL, candidateId, userId]
    );
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code === "42703" || code === "42P01") return;
    console.warn("refreshResumeEmbeddingForCandidate", e);
  }
}
