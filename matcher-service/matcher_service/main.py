"""FastAPI entry: POST /match (optional — requires pip install). Prefer simple_server.py on Python 3.14."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException

from matcher_service.match_core import run_match_dict
from matcher_service.schemas import MatchRequest, MatchResponse, MatchRowOut

app = FastAPI(title="No-AI Matcher", version="1.0.0")


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


@app.post("/match", response_model=MatchResponse)
def match(req: MatchRequest) -> MatchResponse:
    try:
        raw = run_match_dict(
            {
                "jd": req.jd,
                "candidates": [c.model_dump() for c in req.candidates],
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return MatchResponse(
        top_10=[MatchRowOut(**r) for r in raw["top_10"]],
        all_results=[MatchRowOut(**r) for r in raw["all_results"]],
        meta=raw["meta"],
    )


def run() -> None:
    import uvicorn

    uvicorn.run("matcher_service.main:app", host="0.0.0.0", port=8000, reload=False)


if __name__ == "__main__":
    run()
