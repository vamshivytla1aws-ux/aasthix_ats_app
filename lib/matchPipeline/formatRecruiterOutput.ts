import type { AiMatchResult } from "@/lib/matchScoreAi";
import type { RecruiterMatchOutput } from "@/lib/matchPipeline/types";

/** Maps internal AI row → public recruiter JSON shape (e.g. APIs, exports). */
export function formatRecruiterMatchOutput(ai: AiMatchResult): RecruiterMatchOutput | null {
  if (!ai.category_scores) return null;
  return {
    candidate_name: ai.candidate_name || "",
    match_percentage: ai.match_score,
    decision: ai.recruiter_decision ?? "Hold",
    category_scores: ai.category_scores,
    strengths: ai.strengths ?? [],
    gaps: ai.gaps ?? [],
    risks: ai.risk_flags ?? [],
    summary: ai.recruiter_summary || ai.reasoning || "",
    parsed: ai.parsed_profile,
  };
}
