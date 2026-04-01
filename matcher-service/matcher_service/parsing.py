"""Deterministic JD / resume parsing (no AI)."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime

from matcher_service.normalization import normalize_text, normalize_title, unique_preserve_order
from matcher_service.skills import extract_skills, extract_skills_from_sections


@dataclass
class ParsedJD:
    """Structured JD signals for No-AI scoring."""

    raw: str
    must_have_skills: set[str] = field(default_factory=set)
    strong_match_skills: set[str] = field(default_factory=set)
    nice_to_have_skills: set[str] = field(default_factory=set)
    all_skills: set[str] = field(default_factory=set)
    min_years_experience: float | None = None
    title: str = ""
    domains: set[str] = field(default_factory=set)
    education_required: bool = False
    education_markers: set[str] = field(default_factory=set)

    # Back-compat for older call sites (prefilter, tests)
    @property
    def required_skills(self) -> set[str]:
        return self.must_have_skills

    @property
    def preferred_skills(self) -> set[str]:
        return self.nice_to_have_skills

    @property
    def title_line(self) -> str:
        return self.title

    @property
    def min_years(self) -> float | None:
        return self.min_years_experience

    @property
    def domain_hints(self) -> set[str]:
        return self.domains


@dataclass
class ParsedResume:
    raw_text: str
    normalized_text: str
    skills: set[str]
    years_experience: float | None
    recent_titles: list[str]
    domains: set[str]
    education_markers: set[str]
    quality: float

    @property
    def years_est(self) -> float | None:
        return self.years_experience

    @property
    def titles(self) -> list[str]:
        return self.recent_titles

    @property
    def recency_score(self) -> float:
        return _recency_heuristic(self.raw_text)

    @property
    def quality_score(self) -> float:
        return self.quality

    @property
    def domain_hints(self) -> set[str]:
        return self.domains


_DOMAIN_RES = [
    (re.compile(r"\b(fintech|banking|payments?)\b", re.I), "fintech"),
    (re.compile(r"\b(healthcare|medical|hipaa|pharma)\b", re.I), "healthcare"),
    (re.compile(r"\b(edtech|e-?learning|lms)\b", re.I), "edtech"),
    (re.compile(r"\b(e-?commerce|ecommerce|shopify|retail)\b", re.I), "ecommerce"),
    (re.compile(r"\b(saas|b2b\s*software)\b", re.I), "saas"),
    (re.compile(r"\b(database|etl|data warehouse|big data|data engineering|data pipeline)\b", re.I), "data"),
    (re.compile(r"\b(cloud|aws|azure|gcp|google cloud)\b", re.I), "cloud"),
    (re.compile(r"\b(backend|api|apis|microservices|rest api|service layer)\b", re.I), "backend"),
]


def _domains(text: str) -> set[str]:
    out: set[str] = set()
    for rx, tag in _DOMAIN_RES:
        if rx.search(text):
            out.add(tag)
    return out


def _education_markers_jd(text: str) -> set[str]:
    m: set[str] = set()
    tl = text.lower()
    if re.search(r"(?i)\b(bachelor|b\.?s\.?c?|b\.?e\.?|btech|undergraduate)\b", tl):
        m.add("bachelors")
    if re.search(r"(?i)\b(master|m\.?s\.?|m\.?tech|mba|graduate)\b", tl):
        m.add("masters")
    if re.search(r"(?i)\b(ph\.?\s*d|doctorate)\b", tl):
        m.add("phd")
    if re.search(r"(?i)\b(cs\s+degree|computer science degree)\b", tl):
        m.add("cs_degree")
    return m


def _education_markers_resume(text: str) -> set[str]:
    return _education_markers_jd(text)


def _extract_min_years(text: str) -> float | None:
    best: float | None = None
    for pat in [
        r"(\d+)\s*\+\s*years?",
        r"(\d+)\s*[-–]\s*\d+\s*years?",
        r"minimum\s+(?:of\s+)?(\d+)\s*years?",
        r"at\s+least\s+(\d+)\s*years?",
        r"(\d+)\+?\s*years?\s+(?:of\s+)?experience",
    ]:
        m = re.search(pat, text, re.I)
        if m:
            v = float(m.group(1))
            if 0 <= v <= 40:
                if best is None or v < best:
                    best = v
    return best


def _estimate_years_resume(text: str) -> float | None:
    t = text[:80000]
    spans: list[float] = []
    for m in re.finditer(
        r"(20\d{2}|19\d{2})\s*[-–—]\s*(20\d{2}|19\d{2}|present|current|now)",
        t,
        re.I,
    ):
        a, b = m.group(1), m.group(2)
        try:
            y1 = int(a)
            y2 = int(b) if b.isdigit() else datetime.now().year
            if y2 >= y1:
                spans.append(float(y2 - y1))
        except ValueError:
            pass
    if spans:
        return min(45.0, float(max(spans)))

    m = re.search(r"(\d+(?:\.\d+)?)\s*\+?\s*years?", t, re.I)
    if m:
        v = float(m.group(1))
        if 0 <= v <= 45:
            return v

    return None


def _resume_quality(text: str) -> float:
    s = 0.0
    tl = text.lower()
    if re.search(r"(?i)skills|technical", tl):
        s += 0.35
    if re.search(r"(?i)experience|employment|work history", tl):
        s += 0.35
    if re.search(r"(?i)education|university|b\.?s\.?c|m\.?s\.?|b\.?e\.?", tl):
        s += 0.15
    if re.search(r"(?i)project", tl):
        s += 0.15
    return min(1.0, s)


def _recency_heuristic(text: str) -> float:
    head = text[:4000]
    y = len(re.findall(r"20(2[3-9]|3\d)", head))
    if y >= 2:
        return 1.0
    if y == 1:
        return 0.75
    if re.search(r"201[89]|202[0-2]", head):
        return 0.55
    return 0.35


def _extract_titles(text: str) -> list[str]:
    titles: list[str] = []
    for line in text.splitlines()[:80]:
        l = line.strip()
        if 3 < len(l) < 120 and re.search(
            r"(?i)(engineer|developer|architect|lead|manager|analyst|consultant|scientist|specialist|designer)",
            l,
        ):
            titles.append(normalize_title(l))
    return unique_preserve_order(titles)[:10]


def _ordered_skill_list(skills: set[str]) -> list[str]:
    return sorted(skills)


def parse_jd(text: str, title: str = "") -> ParsedJD:
    t = text or ""
    title_clean = (title or "").strip()
    title_n = normalize_title(title_clean)

    # Fallback title extraction from JD body when explicit title is missing
    if not title_n:
        title_patterns = [
            r"(?im)^\s*(senior|lead|principal|staff|junior)?\s*([a-zA-Z0-9\-/ ]{2,40})\s*(engineer|developer|analyst|manager|consultant|architect|specialist)\s*$",
            r"(?i)\b(hiring|looking for|seeking)\s+(?:a|an)?\s*([a-zA-Z0-9\-/ ]{2,50})",
        ]
        for pat in title_patterns:
            m = re.search(pat, t)
            if m:
                extracted = " ".join(
                    [g for g in m.groups() if g and g.lower() not in {"hiring", "looking for", "seeking"}]
                )
                title_n = normalize_title(extracted)
                if title_n:
                    break

    must_sec = ""
    nice_sec = ""

    mm = re.search(
        r"(?i)(must[-\s]?have|required|mandatory|essential|non-negotiable)\s*[:#]?\s*([\s\S]{0,6000}?)(?=(?:nice[-\s]?to[-\s]?have|preferred|bonus|strong|key\s+skills|$))",
        t,
    )
    if mm:
        must_sec = mm.group(2) or ""

    nm = re.search(
        r"(?i)(nice[-\s]?to[-\s]?have|preferred|optional|bonus)\s*[:#]?\s*([\s\S]{0,4000}?)$",
        t,
    )
    if nm:
        nice_sec = nm.group(2) or ""

    must_have = extract_skills_from_sections(must_sec) if must_sec.strip() else set()
    nice_to_have = extract_skills(nice_sec) if nice_sec.strip() else set()
    nice_to_have -= must_have

    head_for_strong = (title_clean + "\n" + t)[:5500]
    body_skills = extract_skills_from_sections(head_for_strong)
    all_skills = extract_skills_from_sections(t) | extract_skills(title_clean)

    strong = set()

    # Primary path: explicit sections exist
    if must_have or nice_to_have:
        strong = body_skills - must_have - nice_to_have

    # Fallback path: no explicit must-have section
    if not must_have:
        candidate_pool = body_skills or all_skills
        ordered = _ordered_skill_list(candidate_pool)

        if ordered:
            must_limit = min(6, len(ordered))
            must_have = set(ordered[:must_limit])
            strong = set(ordered[must_limit : must_limit + 8])

    # Force enterprise/data stack tools into must-have when present
    priority_skills = {
        "greenplum",
        "postgresql",
        "informatica",
        "etl",
        "oracle",
        "unix",
        "pl/sql",
        "sql",
    }

    priority_found = [s for s in _ordered_skill_list(all_skills) if s in priority_skills]
    if priority_found:
        must_have |= set(priority_found[:6])

    # Additional fallback if strong still empty
    if not strong and all_skills:
        remaining = _ordered_skill_list(all_skills - must_have - nice_to_have)
        strong = set(remaining[:8])

    # Keep strong bucket from growing too large
    if len(strong) > 8:
        strong = set(_ordered_skill_list(strong)[:8])

    # Remove overlaps
    strong -= must_have
    strong -= nice_to_have
    nice_to_have -= must_have

    edu_req = bool(
        re.search(
            r"(?i)(bachelor|master|ph\.?d|degree|b\.?tech|m\.?tech)\s+(required|mandatory|must)",
            t,
        )
    )

    return ParsedJD(
        raw=t,
        must_have_skills=must_have,
        strong_match_skills=strong,
        nice_to_have_skills=nice_to_have,
        all_skills=all_skills,
        min_years_experience=_extract_min_years(t + " " + title_clean),
        title=title_n,
        domains=_domains(t + " " + title_clean),
        education_required=edu_req,
        education_markers=_education_markers_jd(t),
    )


def parse_resume(text: str) -> ParsedResume:
    raw = text or ""
    if not raw.strip():
        return ParsedResume(
            raw_text="",
            normalized_text="",
            skills=set(),
            years_experience=None,
            recent_titles=[],
            domains=set(),
            education_markers=set(),
            quality=0.0,
        )

    nt = normalize_text(raw)

    sk = extract_skills_from_sections(raw)
    if len(sk) < 5:
        sk = sk.union(extract_skills(raw))

    years = _estimate_years_resume(raw)
    if years is None:
        m = re.search(r"(\d+(?:\.\d+)?)\s*\+?\s+years", raw, re.I)
        if m:
            years = float(m.group(1))

    return ParsedResume(
        raw_text=raw,
        normalized_text=nt,
        skills=sk,
        years_experience=years,
        recent_titles=_extract_titles(raw),
        domains=_domains(raw),
        education_markers=_education_markers_resume(raw),
        quality=_resume_quality(raw),
    )