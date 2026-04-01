/**
 * Thin wrapper: one candidate = batch of 1 (same path as extract — no extra retries here).
 */
import type { AiEvaluationResult } from "@/lib/aiMatcher/evaluateCandidate";
import { matchCacheKey } from "@/lib/aiMatcher/matchCache";
import { evaluateBatch, type BatchCandidateOut } from "@/lib/aiMatcher/batchEvaluate";

function toEvaluation(b: BatchCandidateOut, name?: string): AiEvaluationResult {
  return {
    candidate_name: String(name || "Unknown").trim() || "Unknown",
    match_score: b.match_score,
    decision: b.decision,
    strengths: [],
    gaps: [],
    risks: [],
    summary: b.summary || "—",
  };
}

export async function safeEvaluateCandidate(
  jd: string,
  resume: string,
  candidateNameHint?: string,
  meta?: { candidateId?: number }
): Promise<AiEvaluationResult> {
  const id = meta?.candidateId ?? `anon_${matchCacheKey(jd, resume).slice(0, 16)}`;
  const [out] = await evaluateBatch(jd, [{ id, resumeText: resume, name: candidateNameHint }]);
  return toEvaluation(out ?? { id: String(id), match_score: 60, decision: "Hold" }, candidateNameHint);
}
