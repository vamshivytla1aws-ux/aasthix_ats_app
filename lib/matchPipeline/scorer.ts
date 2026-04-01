import type { AiCategoryScores } from "@/lib/matchPipeline/types";

/** Fixed recruiter rubric — overall % must align with these weights when categories are complete. */
export const CATEGORY_WEIGHTS: Record<keyof AiCategoryScores, number> = {
  domain_relevance: 0.25,
  core_skills: 0.2,
  business_impact: 0.15,
  stakeholder_management: 0.15,
  advanced_analytics: 0.1,
  tools_tech: 0.1,
  experience: 0.05,
};

export function isCompleteCategoryScores(c: Partial<AiCategoryScores> | null | undefined): c is AiCategoryScores {
  if (!c || typeof c !== "object") return false;
  const keys = Object.keys(CATEGORY_WEIGHTS) as (keyof AiCategoryScores)[];
  return keys.every((k) => typeof c[k] === "number" && Number.isFinite(c[k]));
}

/** Deterministic weighted score from category integers 0–100. */
export function weightedMatchScore(categories: AiCategoryScores): number {
  let sum = 0;
  (Object.keys(CATEGORY_WEIGHTS) as (keyof AiCategoryScores)[]).forEach((k) => {
    const v = Math.max(0, Math.min(100, Math.round(categories[k])));
    sum += CATEGORY_WEIGHTS[k] * v;
  });
  return Math.max(0, Math.min(100, Math.round(sum)));
}

/**
 * Prefer weighted sum when categories are complete (stops LLM from inventing a mismatched overall %).
 * Set MATCH_WEIGHTED_SCORE_ONLY=0 to keep the model's overall_match_percentage when both exist.
 */
export function reconcileOverallPercentage(
  modelOverall: number,
  categories: Partial<AiCategoryScores> | undefined
): number {
  const preferWeighted = process.env.MATCH_WEIGHTED_SCORE_ONLY !== "0";
  if (preferWeighted && isCompleteCategoryScores(categories)) {
    return weightedMatchScore(categories);
  }
  return modelOverall;
}
