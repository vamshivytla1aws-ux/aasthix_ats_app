/**
 * Compact payload for hybrid top-10 AI rerank (no full resumes).
 */

export type CompactJobForRerank = {
  job_id: number;
  job_title: string;
  required_skills: string[];
  preferred_skills: string[];
  min_years_experience: number | null;
  domain: string | null;
  must_have_conditions: string[];
  jd_summary: string;
};

export type RuleBasedSignals = {
  match_score_no_ai: number;
  decision_no_ai: string;
  no_ai_rank: number;
  exact_required_coverage: number;
  title_match: number;
  domain_match: boolean;
  qualification_gate_failed: boolean;
};

export type CompactCandidateForRerank = {
  candidate_id: string;
  recent_titles: string[];
  years_experience: number | null;
  skills_normalized: string[];
  matched_required_skills: string[];
  missing_required_skills: string[];
  recent_experience_summary: string;
  location: string | null;
  work_authorization: string | null;
  rule_based: RuleBasedSignals;
};

export type Top10RerankPayload = {
  job: CompactJobForRerank;
  candidates: CompactCandidateForRerank[];
};

export function buildTop10RerankPayload(input: {
  job: CompactJobForRerank;
  candidates: CompactCandidateForRerank[];
}): Top10RerankPayload {
  return {
    job: input.job,
    candidates: input.candidates.slice(0, 10),
  };
}
