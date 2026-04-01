/**
 * AI match ranking: sort by score, flag top N as shortlisted (optional min-score gate).
 */

export type ShortlistCandidate = {
  id: string;
  name: string;
  match_score: number;
  decision: string;
};

export type ShortlistOptions = {
  /**
   * If set, only candidates at or above this score are eligible for shortlist
   * (top `limit` are taken from that filtered list). Mirrors optional “score ≥ 70” flows.
   */
  minScore?: number;
};

/** 3-tier fit label aligned with recruiter rubric (≥80 / 65–79 / &lt;65). */
export function fitTierFromScore(score: number): "Strong Fit" | "Potential" | "Low Fit" {
  if (score >= 80) return "Strong Fit";
  if (score >= 65) return "Potential";
  return "Low Fit";
}

/**
 * Sort by match_score descending, assign global rank, flag top `limit` as shortlisted.
 * Does not mutate the input array.
 */
export function shortlistTopCandidates<T extends ShortlistCandidate>(
  candidates: T[],
  limit = 10,
  options?: ShortlistOptions
): Array<T & { shortlisted: boolean; rank: number }> {
  const cap = limit;
  const minScore = options?.minScore;

  const sortedAll = [...candidates].sort((a, b) => b.match_score - a.match_score);

  let eligible = sortedAll;
  if (minScore != null && Number.isFinite(minScore)) {
    eligible = sortedAll.filter((c) => c.match_score >= minScore);
  }

  const top = eligible.slice(0, Math.max(0, cap));
  const shortlistedIds = new Set(top.map((c) => c.id));

  return sortedAll.map((c, i) => ({
    ...c,
    shortlisted: shortlistedIds.has(c.id),
    rank: i + 1,
  }));
}
