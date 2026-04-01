export type RankableCandidate = {
  candidate_id: number | string;
  name: string;
  match_score: number;
  decision: string;
  summary: string;
};

export type RankedCandidate<T extends RankableCandidate> = T & { rank: number };

/**
 * Sort by match_score descending and assign 1-based rank.
 */
export function rankCandidates<T extends RankableCandidate>(candidates: T[]): RankedCandidate<T>[] {
  return [...candidates]
    .sort((a, b) => b.match_score - a.match_score)
    .map((c, index) => ({
      ...c,
      rank: index + 1,
    }));
}
