"""Weighted rule-based scoring with stronger must-have enforcement (No-AI only)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from matcher_service.decision import compute_decision, compute_hire_probability
from matcher_service.parsing import ParsedJD, ParsedResume
from matcher_service.skills import combined_skill_signal, required_skill_audit

DEFAULT_WEIGHTS = {
    "must": 0.46,
    "strong": 0.09,
    "nice": 0.04,
    "experience": 0.18,
    "title": 0.10,
    "recency": 0.03,
    "domain": 0.06,
    "education": 0.02,
    "quality": 0.02,
}

_STOP_TITLE = frozenset(
    "the a an and or for with to of in at our remote hybrid full time senior junior lead ii iii iv v sr jr".split()
)

_TITLE_CLUSTERS: tuple[frozenset[str], ...] = (
    frozenset({"etl", "data", "warehouse", "pipeline", "integration", "informatica", "analytics", "bi"}),
    frozenset({"engineer", "developer", "programmer", "architect"}),
    frozenset({"software", "backend", "frontend", "fullstack", "full-stack"}),
    frozenset({"java", "python", "node", "react", "angular", "vue"}),
)


@dataclass
class ScoreDetail:
    match_score: int
    hire_probability: int
    decision: str
    must_ratio: float
    exp_shortfall: float


def _title_family_score(jd_title: str, resume_titles: list[str]) -> float:
    if not jd_title.strip():
        return 35.0
    if not resume_titles:
        return 20.0

    j = {x for x in jd_title.lower().split() if x not in _STOP_TITLE and len(x) > 1}
    best = 0.0

    for rt in resume_titles:
        r = {x for x in rt.lower().split() if x not in _STOP_TITLE and len(x) > 1}
        if not j or not r:
            continue

        inter = len(j & r)
        uni = len(j | r) or 1
        jacc = 100.0 * inter / uni

        boost = 0.0
        for a in j:
            for b in r:
                if a == b:
                    continue
                for cl in _TITLE_CLUSTERS:
                    if a in cl and b in cl:
                        boost += 4.0

        best = max(best, min(100.0, jacc + boost))

    if best >= 70:
        return best
    if best >= 40:
        return max(45.0, best)
    if best >= 20:
        return 28.0
    return 15.0


def _experience_score(jd_min: float | None, cand_years: float | None) -> tuple[float, float]:
    if jd_min is None:
        return 75.0, 0.0

    if cand_years is None:
        return 35.0, float(jd_min)

    if cand_years >= jd_min:
        over = cand_years - jd_min
        bonus = min(8.0, over * 1.5)
        return min(100.0, 90.0 + bonus), 0.0

    short = jd_min - cand_years

    if cand_years < jd_min * 0.5:
        return 20.0, float(short)
    if cand_years < jd_min * 0.75:
        return 40.0, float(short)

    pen = min(55.0, short * 12.0)
    return max(30.0, 85.0 - pen), float(short)


def _edu_score(jd: ParsedJD, resume: ParsedResume) -> float:
    if not jd.education_required:
        return 70.0
    if jd.education_markers & resume.education_markers:
        return 92.0
    if resume.education_markers:
        return 60.0
    return 35.0


def compute_rule_signals(jd: ParsedJD, resume: ParsedResume) -> dict[str, Any]:
    """Structured signals for hybrid AI rerank (no full resume)."""
    must = jd.must_have_skills
    resume_skills = resume.skills
    matched_req, missing_req, exact_cov = required_skill_audit(must, resume_skills)

    title_match = _title_family_score(jd.title, resume.recent_titles) / 100.0
    domain_match = bool(jd.domains and resume.domains and (jd.domains & resume.domains))
    qualification_gate_failed = bool(
        jd.education_required
        and not (jd.education_markers & resume.education_markers)
    )

    return {
        "matched_required_skills": matched_req,
        "missing_required_skills": missing_req,
        "exact_required_coverage": float(exact_cov),
        "title_match": round(max(0.0, min(1.0, title_match)), 4),
        "domain_match": domain_match,
        "qualification_gate_failed": qualification_gate_failed,
    }


def _effective_fit(
    jd: ParsedJD,
    must_cov: float,
    strong_cov: float,
    nice_cov: float,
) -> float:
    if jd.must_have_skills:
        return min(
            1.0,
            0.70 * must_cov + 0.22 * strong_cov + 0.08 * nice_cov,
        )
    return min(1.0, 0.70 * strong_cov + 0.20 * nice_cov + 0.10 * must_cov)


def score_candidate(
    jd: ParsedJD,
    resume: ParsedResume,
    weights: dict[str, float] | None = None,
) -> ScoreDetail:
    
    weights = weights or DEFAULT_WEIGHTS
    
    if not (jd.raw or "").strip():
        return ScoreDetail(0, 0, "Reject", 0.0, 0.0)

    resume_skills = resume.skills

    must_cov, strong_cov, nice_cov = combined_skill_signal(
        jd.must_have_skills,
        jd.strong_match_skills,
        jd.nice_to_have_skills,
        resume_skills,
    )

    effective = _effective_fit(jd, must_cov, strong_cov, nice_cov)

    s_must = must_cov * 100.0
    if jd.must_have_skills and must_cov >= 0.99:
        s_must = min(100.0, s_must + 5.0)

    s_strong = strong_cov * 100.0
    s_nice = nice_cov * 100.0

    exp_sc, exp_short = _experience_score(jd.min_years_experience, resume.years_experience)
    s_title = _title_family_score(jd.title, resume.recent_titles)
    s_rec = resume.recency_score * 100.0
    s_dom = (
        100.0
        if (jd.domains and resume.domains and (jd.domains & resume.domains))
        else (55.0 if not jd.domains else 35.0)
    )
    s_edu = _edu_score(jd, resume)
    s_q = resume.quality * 100.0

    raw = (
            weights["must"] * s_must
            + weights["strong"] * s_strong
            + weights["nice"] * s_nice
            + weights["experience"] * exp_sc
            + weights["title"] * s_title
            + weights["recency"] * s_rec
            + weights["domain"] * s_dom
            + weights["education"] * s_edu
            + weights["quality"] * s_q
    )

    if jd.must_have_skills:
        if must_cov < 0.20:
            raw = min(raw, 38.0)
        elif must_cov < 0.40:
            raw = min(raw, 52.0)
        elif must_cov < 0.60:
            raw = min(raw, 64.0)

    if jd.min_years_experience is not None and resume.years_experience is not None:
        if resume.years_experience < jd.min_years_experience * 0.50:
            raw = min(raw, 50.0)
        elif resume.years_experience < jd.min_years_experience * 0.70:
            raw = min(raw, 62.0)

    if jd.domains and not resume.domains:
        raw -= 5.0

    if raw > 85.0:
        raw = 85.0 + (raw - 85.0) * 0.35

    match_score = int(max(0, min(100, round(raw))))

    hp = compute_hire_probability(match_score, effective, exp_short)
    dec = compute_decision(match_score, effective, exp_short)

    if effective < 0.12 and match_score < 28:
        match_score = min(match_score, 24)
        hp = min(hp, 28)
        dec = "Reject"

    return ScoreDetail(
        match_score=match_score,
        hire_probability=hp,
        decision=dec,
        must_ratio=effective,
        exp_shortfall=exp_short,
    )


def score_empty_resume() -> ScoreDetail:
    return ScoreDetail(0, 0, "Reject", 0.0, 0.0)