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
  created_at: string;
};

export type SingleMatchHistoryApiResponse = {
  runs: SingleMatchHistoryRun[];
  migration_required?: boolean;
};
