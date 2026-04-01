/**
 * Shared types for recruiter-style JD↔resume matching (parse → score → explain).
 */

export type AiCategoryScores = {
  domain_relevance: number;
  core_skills: number;
  business_impact: number;
  stakeholder_management: number;
  advanced_analytics: number;
  tools_tech: number;
  experience: number;
};

/** Structured extraction (step 1 — populated by the model, not keyword rules). */
export type ParsedMatchProfile = {
  jd_primary_themes: string[];
  resume_domain_evidence: string[];
  tools_evidence: string[];
  impact_evidence: string[];
  stakeholder_evidence: string[];
};

/** Public / API-friendly shape aligned with product spec. */
export type RecruiterMatchOutput = {
  candidate_name: string;
  match_percentage: number;
  decision: "Proceed to Interview" | "Hold" | "Reject";
  category_scores: AiCategoryScores;
  strengths: string[];
  gaps: string[];
  risks: string[];
  summary: string;
  parsed?: ParsedMatchProfile;
};
