# Evaluation

## Dataset format (JSONL)

Each line:

```json
{
  "job_id": "string",
  "candidate_id": "string",
  "jd_text": "...",
  "resume_text": "...",
  "recruiter_label": "Proceed | Hold | Reject",
  "shortlisted": 0,
  "hired": 0
}
```

## Run

From `matcher-service/`:

```bash
python evaluation/evaluate.py --dataset data/eval_sample.jsonl
```

## Interpreting “90%”

Target **~90%** means **~90% agreement with recruiter labels** on a curated evaluation set (decisions / shortlist), after threshold tuning if needed — not inflating raw `match_score`.

Use `--tune-thresholds` style experiments by editing cutoffs in `matcher_service/decision.py` and re-running this script.
