export type SingleMatchRequirementStatus =
  | "met"
  | "partially_met"
  | "not_met"
  | "unclear_due_to_source_quality";

export type SingleMatchRequirementMatchType =
  | "exact_match"
  | "normalized_match"
  | "synonym_match"
  | "fuzzy_match"
  | "semantic_match"
  | "gpt_validated_match"
  | "partial_match"
  | "missing"
  | "unknown";

export type SingleMatchRequirementBucket =
  | "core_responsibility"
  | "must_have_skill"
  | "seniority_ownership"
  | "domain_platform"
  | "nice_to_have";

export type SingleMatchRequirementPriority = "core" | "important" | "nice_to_have";

export type SingleMatchEvidenceQuality = "strong" | "mixed" | "limited" | "insufficient";

export type SingleMatchFitLevel = "Strong Match" | "Good Match" | "Moderate Match" | "Weak Match" | "Not Recommended";

export type SingleMatchScoreBreakdownDetail = {
  score: number;
  max_score: number;
  details: string[] | string;
};

export type SingleMatchScoreBreakdown = {
  must_have_skills: SingleMatchScoreBreakdownDetail;
  experience: SingleMatchScoreBreakdownDetail;
  responsibilities: SingleMatchScoreBreakdownDetail;
  nice_to_have_skills: SingleMatchScoreBreakdownDetail;
  domain_cloud_education: SingleMatchScoreBreakdownDetail;
  resume_evidence_quality: SingleMatchScoreBreakdownDetail;
};

export type SingleMatchRequirementBreakdownItem = {
  id: string;
  label: string;
  bucket: SingleMatchRequirementBucket;
  priority: SingleMatchRequirementPriority;
  status: SingleMatchRequirementStatus;
  weight: number;
  evidence: string[];
  rationale?: string | null;
  match_type?: SingleMatchRequirementMatchType | null;
  score_awarded?: number | null;
  max_score?: number | null;
  similarity_score?: number | null;
  confidence?: number | null;
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
  fit_level?: SingleMatchFitLevel | null;
  score_breakdown?: SingleMatchScoreBreakdown | null;
  partial_matches?: string[];
  missing_nice_to_have_requirements?: string[];
  critical_unknowns?: string[];
  red_flags?: string[];
  recruiter_summary?: string | null;
  candidate_feedback?: string | null;
  model_used?: string | null;
  fallback_review_used?: boolean;
  resume_recovery_attempted?: boolean;
  resume_recovery_succeeded?: boolean;
  resume_recovery_reason?: string | null;
  resume_source_before_recovery?: "stored_resume_text" | "uploaded_resume_file" | "experience_summary_or_skills" | "none" | null;
  resume_source_after_recovery?: "stored_resume_text" | "uploaded_resume_file" | "experience_summary_or_skills" | "none" | null;
  debug_requirements?: Array<{
    requirement: string;
    category: string;
    status: string;
    match_type: SingleMatchRequirementMatchType | string;
    score_awarded: number;
    max_score: number;
    evidence: string;
    reason: string;
    similarity_score: number;
    confidence: number;
  }>;
  developer_debug?: {
    extracted_jd_requirements?: Array<{
      requirement: string;
      category: string;
      normalized_terms: string[];
      equivalents: string[];
    }>;
    extracted_resume_signals?: string[];
    synonym_matches?: Array<{ requirement: string; matches: string[] }>;
    semantic_matches?: Array<{ requirement: string; similarity_score: number; evidence: string[] }>;
    final_gaps_after_gap_audit?: Array<{ requirement: string; status: string; reason: string }>;
    caps_applied?: Array<{ code: string; limit: number; reason: string }>;
    final_score?: number;
  };
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
  fit_level?: SingleMatchFitLevel | null;
  score_breakdown?: SingleMatchScoreBreakdown | null;
  partial_matches?: string[];
  missing_nice_to_have_requirements?: string[];
  critical_unknowns?: string[];
  red_flags?: string[];
  recruiter_summary?: string | null;
  candidate_feedback?: string | null;
  model_used?: string | null;
  fallback_review_used?: boolean;
  resume_recovery_attempted?: boolean;
  resume_recovery_succeeded?: boolean;
  resume_recovery_reason?: string | null;
  resume_source_before_recovery?: SingleMatchCheckResultPayload["resume_source"] | null;
  resume_source_after_recovery?: SingleMatchCheckResultPayload["resume_source"] | null;
  debug_requirements?: SingleMatchCheckResultPayload["debug_requirements"];
  developer_debug?: SingleMatchCheckResultPayload["developer_debug"];
  created_at: string;
};

export type SingleMatchHistoryApiResponse = {
  runs: SingleMatchHistoryRun[];
  migration_required?: boolean;
};
