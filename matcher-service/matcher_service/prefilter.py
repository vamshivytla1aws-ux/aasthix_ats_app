"""
Stage-1 prefilter for very large candidate pools (1000+).
Vector search is NOT used here — reserved for AI semantic matching only.

Typical use: overlap on required skills + title heuristics, then full scoring on top N.
"""
from __future__ import annotations

from dataclasses import dataclass

from matcher_service.parsing import parse_jd, parse_resume
from matcher_service.skills import extract_skills


@dataclass
class CandidateLite:
    id: str
    resume: str


def prefilter_candidates(
    jd: str,
    candidates: list[CandidateLite],
    *,
    limit: int = 150,
) -> list[CandidateLite]:
    """
    Keep top `limit` candidates by cheap skill overlap with JD before expensive scoring.
    """
    if len(candidates) <= limit:
        return candidates

    title_guess = jd.split("\n", 1)[0].strip()[:160]
    parsed = parse_jd(jd, title=title_guess)
    req = (
        parsed.must_have_skills
        or parsed.strong_match_skills
        or parsed.all_skills
        or extract_skills(jd)
    )

    scored: list[tuple[float, CandidateLite]] = []
    for c in candidates:
        if not (c.resume or "").strip():
            scored.append((0.0, c))
            continue
        pr = parse_resume(c.resume)
        overlap = len(req & pr.skills) / max(1, len(req))
        scored.append((overlap, c))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in scored[:limit]]
