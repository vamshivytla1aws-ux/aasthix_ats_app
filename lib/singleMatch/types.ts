export type SingleMatchRequirementStatus =
  | "met"
  | "partially_met"
  | "not_met"
  | "unclear_due_to_source_quality";

export type SingleMatchRequirementBucket =
  | "core_responsibility"
  | "must_have_skill"
  | "seniority_ownership"
  | "domain_platform"
  | "nice_to_have";

export type SingleMatchRequirementPriority = "core" | "important" | "nice_to_have";

export type SingleMatchEvidenceQuality = "strong" | "mixed" | "limited" | "insufficient";

export type SingleMatchRequirementBreakdownItem = {
  id: string;
  label: string;
  bucket: SingleMatchRequirementBucket;
  priority: SingleMatchRequirementPriority;
  status: SingleMatchRequirementStatus;
  weight: number;
  evidence: string[];
  rationale?: string | null;
};

export type SingleMatchCheckResultPayload = {
  match_score: number;
  match_score_no_ai: number | null;
  ai_match_score: number | null;
  decision: string | null;
  decision_no_ai: string | null;
  ai_decision: string | null;
  matched_skills: string[];
  missing_required_skills: string[];
  reasoning: string | null;
  summary: string | null;
  resume_source?: "stored_resume_text" | "uploaded_resume_file" | "experience_summary_or_skills" | "none";
  resume_chars_scored?: number | null;
  jd_chars_scored?: number | null;
  ai_evidence_highlights?: string[];
  requirement_breakdown?: SingleMatchRequirementBreakdownItem[];
  confidence_score?: number | null;
  confidence_reasons?: string[];
  resume_quality_flags?: string[];
  decision_drivers?: string[];
  risk_flags?: string[];
  interview_focus_areas?: string[];
  follow_up_questions?: string[];
  recommended_next_step?: string | null;
  evidence_quality?: SingleMatchEvidenceQuality | null;
};

export type SingleMatchCheckApiResponse = {
  success: true;
  jobId: number;
  candidateId: number;
  result: SingleMatchCheckResultPayload;
  /** False when migration 0054 is not applied or insert failed. */
  history_saved?: boolean;
};

/** One persisted row from GET .../single-match-check/history */
export type SingleMatchHistoryRun = {
  id: number;
  job_id: number;
  candidate_id: number;
  candidate_full_name: string;
  use_ai: boolean;
  match_score: number;
  match_score_no_ai: number | null;
  ai_match_score: number | null;
  decision: string | null;
  decision_no_ai: string | null;
  ai_decision: string | null;
  matched_skills: string[];
  missing_required_skills: string[];
  reasoning: string | null;
  summary: string | null;
  resume_source?: SingleMatchCheckResultPayload["resume_source"];
  resume_chars_scored?: number | null;
  jd_chars_scored?: number | null;
  ai_evidence_highlights?: string[];
  requirement_breakdown?: SingleMatchRequirementBreakdownItem[];
  confidence_score?: number | null;
  confidence_reasons?: string[];
  resume_quality_flags?: string[];
  decision_drivers?: string[];
  risk_flags?: string[];
  interview_focus_areas?: string[];
  follow_up_questions?: string[];
  recommended_next_step?: string | null;
  evidence_quality?: SingleMatchEvidenceQuality | null;
  created_at: string;
};

export type SingleMatchHistoryApiResponse = {
  runs: SingleMatchHistoryRun[];
  migration_required?: boolean;
};
