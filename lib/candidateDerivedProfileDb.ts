import { query } from "@/lib/db";
import { computeCandidateDerivedProfile } from "@/lib/candidateDerivedProfile";

/** Persists normalized_skills, title, years, domain_tags, resume_length for prefilter (best-effort).
 *  Hybrid AI rerank reuses these same columns via `buildCompactAiCandidateProfile` (no duplicate store).
 */
export async function persistCandidateDerivedProfile(candidateId: number): Promise<void> {
  try {
    const res = await query(
      `SELECT skills, resume_text, experience_summary FROM candidates WHERE id = $1 LIMIT 1`,
      [candidateId]
    );
    const row = res.rows[0] as
      | { skills: string | null; resume_text: string | null; experience_summary: string | null }
      | undefined;
    if (!row) return;
    const p = computeCandidateDerivedProfile(row);
    await query(
      `
      UPDATE candidates
      SET
        normalized_skills = $2::text[],
        normalized_title = $3,
        years_experience = $4,
        domain_tags = $5::text[],
        resume_length = $6,
        profile_last_computed_at = NOW()
      WHERE id = $1
      `,
      [
        candidateId,
        p.normalized_skills,
        p.normalized_title,
        p.years_experience,
        p.domain_tags,
        p.resume_length,
      ]
    );
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code === "42703") return;
    console.warn("persistCandidateDerivedProfile", candidateId, e);
  }
}
