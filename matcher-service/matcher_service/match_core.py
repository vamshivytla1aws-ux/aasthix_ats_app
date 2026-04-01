"""
Pure-Python match orchestration (dict in/out). Safe to import without FastAPI/Pydantic.
"""
from __future__ import annotations

import time
from typing import Any

from matcher_service.parsing import parse_jd, parse_resume
from matcher_service.scoring import compute_rule_signals, score_candidate, score_empty_resume


def run_match_dict(body: dict[str, Any]) -> dict[str, Any]:
    """
    Input: {"jd": str, "candidates": [{"id": str, "resume": str}, ...]}
    Output: {"top_10": [...], "all_results": [...], "meta": {...}}
    """
    t0 = time.perf_counter()
    jd_text = (body.get("jd") or "").strip()
    if not jd_text:
        raise ValueError("jd is required")

    raw_cands = body.get("candidates") or []
    if not isinstance(raw_cands, list):
        raw_cands = []

    title_guess = jd_text.split("\n", 1)[0].strip()[:160]
    parsed_jd = parse_jd(jd_text, title=title_guess)

    rows: list[dict[str, Any]] = []
    for c in raw_cands[:60]:
        if not isinstance(c, dict):
            continue
        cid = str(c.get("id", ""))
        resume = (c.get("resume") or "").strip()
        if not resume:
            z = score_empty_resume()
            sig = compute_rule_signals(parsed_jd, parse_resume(""))
            rows.append(
                {
                    "id": cid,
                    "match_score": z.match_score,
                    "hire_probability": z.hire_probability,
                    "decision": z.decision,
                    **sig,
                }
            )
            continue
        pr = parse_resume(resume)
        from matcher_service.scoring import DEFAULT_WEIGHTS

        sc = score_candidate(parsed_jd, pr, weights=DEFAULT_WEIGHTS)
        sig = compute_rule_signals(parsed_jd, pr)
        rows.append(
            {
                "id": cid,
                "match_score": sc.match_score,
                "hire_probability": sc.hire_probability,
                "decision": sc.decision,
                **sig,
            }
        )

    rows.sort(key=lambda r: r["match_score"], reverse=True)
    top10 = rows[:10]
    latency = int((time.perf_counter() - t0) * 1000)
    return {
        "top_10": top10,
        "all_results": rows,
        "meta": {"processed_count": len(rows), "latency_ms": latency},
    }
