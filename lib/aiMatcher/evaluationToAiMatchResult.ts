import type { AiEvaluationResult } from "@/lib/aiMatcher/evaluateCandidate";
import type { AiMatchResult } from "@/lib/matchScoreAi";

function normalizeDecision(
  d: string
): "Proceed to Interview" | "Hold" | "Reject" | undefined {
  const s = d.toLowerCase();
  if (s.includes("reject")) return "Reject";
  if (s.includes("hold")) return "Hold";
  if (s.includes("proceed") || s.includes("interview")) return "Proceed to Interview";
  return undefined;
}

/** Map single-candidate engine output → batch matcher shape for mergeHybridScore. */
export function evaluationToAiMatchResult(candidateId: number, ev: AiEvaluationResult): AiMatchResult {
  const rd = normalizeDecision(String(ev.decision || ""));
  return {
    candidate_id: candidateId,
    match_score: ev.match_score,
    matched_skills: ev.strengths.slice(0, 15),
    missing_skills: ev.gaps.slice(0, 15),
    reasoning: ev.summary,
    candidate_name: ev.candidate_name,
    recruiter_summary: ev.summary,
    category_scores: ev.category_scores,
    strengths: ev.strengths,
    gaps: ev.gaps,
    risk_flags: ev.risks,
    recruiter_decision: rd,
  };
}
