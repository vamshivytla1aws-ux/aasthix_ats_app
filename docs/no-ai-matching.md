# No-AI matching (rule-based)

## Overview

- **Separate from AI matching**: Scores are stored only in `candidate_job_matches.match_score_no_ai`, `hire_probability`, `decision_no_ai`, and `computed_no_ai_at`. Existing AI/hybrid fields (`match_score`, `match_breakdown`, etc.) are **not** overwritten by this flow.
- **Stages**: (1) Optional PostgreSQL prefilter when the candidate pool is large (`>100` in `candidate_job_matches` for the job) using `candidates.normalized_skills`, `years_experience`, `normalized_title`. (2) Deterministic Python matcher at `POST /match` (default `http://localhost:8000/match`).
- **Vector / pgvector**: Not used here. Reserved for AI semantic retrieval only.

## API

- `POST /api/match/no-ai`  
  Body: `{ "jobId": "<id>" }`  
  Requires `jobs.manage`.  
  Timeouts the Python call at **10s** (`504` on timeout).  
  Returns `{ success, jobId, processed, top_10, candidates, meta }`.

## Environment

- `MATCHER_PYTHON_URL` — Python matcher base URL (default `http://localhost:8000/match`).

## Database

Run migration `0052_no_ai_match_prefilter.sql`.

- `candidate_job_matches`: `match_score_no_ai`, `hire_probability`, `decision_no_ai`, `computed_no_ai_at`
- `candidates`: `normalized_skills`, `normalized_title`, `years_experience`, `domain_tags`, `resume_length`, `profile_last_computed_at`

Indexes: GIN on `normalized_skills` and `domain_tags`, btree on `years_experience`, `normalized_title`, `resume_length`.

**Note**: This schema does not use `candidates.job_id` (matches are in `candidate_job_matches`). A hypothetical `idx_candidates_job_id` applies only if you add that column elsewhere.

## Python matcher

See `matcher-service/README.md`. **Recommended (no pip):**

```bash
cd matcher-service
python -m matcher_service.simple_server
```

Optional FastAPI stack requires **Python 3.10–3.12** if `pydantic-core` fails to install (e.g. on 3.14).

## Scoring dimensions (Python)

Weighted components (total 100%): required skills 35%, preferred 20%, experience 15%, title 10%, recency 5%, domain 5%, education (when JD requires) 5%, resume quality 5%. Caps apply when must-have coverage is low or experience is far below JD.

## Evaluation & “90% accuracy”

**“~90% agreement”** means alignment with **recruiter labels on a held-out evaluation dataset** (shortlist/decision), not an inflated raw score. See `matcher-service/evaluation/README.md` and `npm test` / `pytest` for harnesses.

## Scaling (1000+ candidates)

1. Postgres prefilter (skills/experience/title) → top 150.  
2. Python matcher on ≤60 per request (sync path).  
3. For larger batches: async jobs, cache parsed JD, cache per-candidate skill profiles.

Utility: `matcher_service.prefilter.prefilter_candidates` (cheap overlap before full scoring).
