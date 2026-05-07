# No-AI matching (rule-based)

## Overview

- **Separate from AI matching**: Scores are stored only in `candidate_job_matches.match_score_no_ai`, `hire_probability`, `decision_no_ai`, and `computed_no_ai_at`. Existing AI/hybrid fields (`match_score`, `match_breakdown`, etc.) are not overwritten by this flow.
- **Stages**:
  1. Optional PostgreSQL prefilter when the candidate pool is large (`>100` in `candidate_job_matches` for the job) using `candidates.normalized_skills`, `years_experience`, `normalized_title`.
  2. Deterministic in-app matcher in `lib/noAiMatch/localMatcher.ts`.
- **Vector / pgvector**: Not used here. Reserved for AI semantic retrieval only.

## API

- `POST /api/match/no-ai`
  - Body: `{ "jobId": "<id>" }`
  - Requires `jobs.manage`
  - Returns `{ success, jobId, processed, top_10, candidates, meta }`

## Database

Run migration `0052_no_ai_match_prefilter.sql`.

- `candidate_job_matches`: `match_score_no_ai`, `hire_probability`, `decision_no_ai`, `computed_no_ai_at`
- `candidates`: `normalized_skills`, `normalized_title`, `years_experience`, `domain_tags`, `resume_length`, `profile_last_computed_at`

Indexes: GIN on `normalized_skills` and `domain_tags`, btree on `years_experience`, `normalized_title`, `resume_length`.

## Scoring dimensions (local matcher)

The in-app matcher combines:
- required-skill coverage
- title signal
- domain signal

and derives:
- `match_score` (0-100)
- `hire_probability` (0-100)
- `decision` (`Proceed`, `Hold`, `Reject`)

It also returns:
- matched required skills
- missing required skills
- required-skill coverage %
- title/domain flags

## Scaling (1000+ candidates)

1. Postgres prefilter (skills/experience/title) to reduce the pool.
2. In-app deterministic matcher on the filtered pool (sync path).
3. For larger batches: async jobs, cache parsed JD, cache per-candidate skill profiles.
