# No-AI matcher service

Deterministic, explainable JD↔resume scoring. **No OpenAI, no embeddings, no vectors.**

## Run locally (recommended — no `pip install`)

Works on **any Python 3.x** (including 3.14), **stdlib only**:

```bash
cd matcher-service
python -m matcher_service.simple_server
```

Listens on `http://127.0.0.1:8000` — same `POST /match` contract as the Node app expects.

## Option B: FastAPI + Uvicorn

Use **Python 3.10, 3.11, or 3.12** if `pip install` fails with `pydantic-core` / `metadata-generation-failed` (common on **3.14** until wheels exist).

```bash
cd matcher-service
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
python -m uvicorn matcher_service.main:app --host 127.0.0.1 --port 8000
```

Health: `GET http://localhost:8000/health`  
Match: `POST http://localhost:8000/match`

## Request body

```json
{
  "jd": "full job description text",
  "candidates": [{ "id": "1", "resume": "plain text" }]
}
```

Max **60** candidates per request (enforced in app).

## Response

```json
{
  "top_10": [{ "id": "1", "match_score": 84, "hire_probability": 71, "decision": "Proceed" }],
  "all_results": [...],
  "meta": { "processed_count": 10, "latency_ms": 120 }
}
```

## Layout

- `matcher_service/skills.py` — normalization & extraction  
- `matcher_service/parsing.py` — JD/resume parsing  
- `matcher_service/scoring.py` — weighted dimensions + caps  
- `matcher_service/decision.py` — hire probability + Proceed/Hold/Reject  
- `matcher_service/prefilter.py` — stage-1 filter for large pools  

## Tests

```bash
pip install pytest
pytest matcher-service/tests -q
```

## Evaluation dataset

See `evaluation/README.md` and `data/eval_sample.jsonl`.
