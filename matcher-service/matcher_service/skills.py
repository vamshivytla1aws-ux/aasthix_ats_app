"""
Deterministic skill extraction, normalization, and family-based partial credit (no ML).
"""
from __future__ import annotations

import re
from typing import Iterable

from matcher_service.normalization import clamp, unique_preserve_order

# Token -> canonical surface form (lowercase)
ALIASES: dict[str, str] = {
    "js": "javascript",
    "ecmascript": "javascript",
    "javascript": "javascript",
    "ts": "typescript",
    "typescript": "typescript",
    "nodejs": "node.js",
    "node": "node.js",
    "node.js": "node.js",
    "reactjs": "react",
    "react.js": "react",
    "react": "react",
    "nextjs": "next.js",
    "next": "next.js",
    "next.js": "next.js",
    "vuejs": "vue",
    "vue": "vue",
    "angularjs": "angular",
    "angular": "angular",
    "python": "python",
    "py": "python",
    "django": "django",
    "flask": "flask",
    "fastapi": "fastapi",
    "java": "java",
    "spring": "spring boot",
    "springboot": "spring boot",
    "spring-boot": "spring boot",
    "spring boot": "spring boot",
    "golang": "go",
    "go": "go",
    "postgres": "postgresql",
    "postgresql": "postgresql",
    "greenplum": "greenplum",
    "psql": "postgresql",
    "redshift": "redshift",
    "snowflake": "snowflake",
    "bigquery": "bigquery",
    "teradata": "teradata",
    "oracle": "oracle",
    "sql server": "sql server",
    "mongo": "mongodb",
    "mongodb": "mongodb",
    "mysql": "mysql",
    "redis": "redis",
    "aws": "aws",
    "azure": "azure",
    "gcp": "gcp",
    "docker": "docker",
    "k8s": "kubernetes",
    "kubernetes": "kubernetes",
    "terraform": "terraform",
    "graphql": "graphql",
    "kafka": "kafka",
    "rabbitmq": "rabbitmq",
    "git": "git",
    "linux": "linux",
    "unix": "unix",
    "bash": "bash",
    "shell": "shell",
    "zsh": "shell",
    "jenkins": "ci/cd",
    "cicd": "ci/cd",
    "ci/cd": "ci/cd",
    "pytest": "pytest",
    "junit": "junit",
    "selenium": "selenium",
    "cypress": "cypress",
    "microservices": "microservices",
    "micro-services": "microservices",
    "rest": "rest",
    "restful": "rest",
    "sql": "sql",
    "informatica": "informatica",
    "talend": "talend",
    "ssis": "ssis",
    "pentaho": "pentaho",
    "datastage": "datastage",
    "etl": "etl",
    "elt": "etl",
    "plsql": "pl/sql",
    "pl/sql": "pl/sql",
    "shell scripting": "shell",
    "bash scripting": "shell",
    "data warehousing": "data warehouse",
    "datawarehouse": "data warehouse",
    "dw": "data warehouse",
    "airflow": "airflow",
    "spark": "spark",
    "hadoop": "hadoop",
}

# Families: any two skills in the same set give partial credit across JD/resume
SKILL_FAMILIES: tuple[frozenset[str], ...] = (
    frozenset({"postgresql", "greenplum", "redshift", "snowflake", "bigquery", "teradata", "oracle", "sql server"}),
    frozenset({"etl", "informatica", "talend", "ssis", "pentaho", "datastage"}),
    frozenset({"unix", "linux", "bash", "shell"}),
    frozenset({"javascript", "typescript", "node.js"}),
    frozenset({"react", "vue", "angular"}),
    frozenset({"aws", "azure", "gcp"}),
    frozenset({"docker", "kubernetes", "terraform"}),
    frozenset({"kafka", "rabbitmq"}),
    frozenset({"django", "flask", "fastapi", "python"}),
    frozenset({"mysql", "mongodb", "redis", "postgresql"}),
    frozenset({"data warehouse", "etl", "informatica", "talend", "ssis", "pentaho", "datastage"}),
    frozenset({"spark", "hadoop", "big data"}),
    frozenset({"airflow", "etl", "data pipeline"}),
    frozenset({"pl/sql", "sql", "oracle"}),
)

# Same family, different tokens (not aliases): partial credit weight
PARTIAL_FAMILY_MATCH = 0.40
PARTIAL_ALIAS_NEAR = 0.40


def _family_of(skill: str) -> frozenset[str] | None:
    s = skill.lower().strip()
    for fam in SKILL_FAMILIES:
        if s in fam:
            return fam
    return None


def skills_in_same_family(a: str, b: str) -> bool:
    fa, fb = _family_of(a), _family_of(b)
    return fa is not None and fa is fb


def normalize_skill(term: str) -> str | None:
    t = term.strip().lower().rstrip(".")
    if len(t) < 2:
        return None
    return ALIASES.get(t, t if len(t) >= 2 else None)


EXTRA_PHRASES = [
    "machine learning",
    "deep learning",
    "system design",
    "react native",
    "spring boot",
    "node.js",
    "next.js",
    "ci/cd",
    "amazon web services",
    "continuous integration",
    "data engineering",
    "data pipeline",
]

_PATTERNS: list[tuple[re.Pattern[str], str]] = []
for phrase in sorted(set(EXTRA_PHRASES + list(set(ALIASES.values()))), key=len, reverse=True):
    esc = re.escape(phrase)
    _PATTERNS.append((re.compile(rf"(?<![a-z0-9]){esc}(?![a-z0-9])", re.I), phrase.lower()))


def _unique_hits(text: str) -> dict[str, int]:
    lower = text.lower()
    counts: dict[str, int] = {}
    for rx, canon in _PATTERNS:
        for _ in rx.finditer(lower):
            counts[canon] = min(3, counts.get(canon, 0) + 1)
    for m in re.finditer(r"[a-z0-9][a-z0-9.+#/-]{1,32}", lower):
        tok = m.group(0)
        c = normalize_skill(tok)
        if c:
            counts[c] = min(2, counts.get(c, 0) + 1)
    return counts


def extract_skills(text: str) -> set[str]:
    return set(_unique_hits(text).keys())


def extract_skill_counts(text: str) -> dict[str, int]:
    return dict(_unique_hits(text))


def extract_skills_from_sections(text: str) -> set[str]:
    blocks = re.split(
        r"(?i)(skills|technical skills|experience|work history|education|projects)\s*[:#]?\s*",
        text,
    )
    base = extract_skills(text)
    if len(blocks) > 1:
        base |= extract_skills("\n".join(blocks[1:]))
    return base


def _best_match_weight(req: str, resume_skills: set[str]) -> float:
    """1.0 exact, ~0.72 same family, ~0.55 related alias path."""
    r = req.lower().strip()
    if r in resume_skills:
        return 1.0
    for cand in resume_skills:
        if cand == r:
            return 1.0
        if skills_in_same_family(r, cand):
            return PARTIAL_FAMILY_MATCH
        if normalize_skill(r) == normalize_skill(cand) and normalize_skill(r):
            return 1.0
    # cross-family: e.g. greenplum in resume vs postgresql in JD — aliases may already align
    r_norm = normalize_skill(r) or r
    for cand in resume_skills:
        c_norm = normalize_skill(cand) or cand
        if r_norm == c_norm:
            return 1.0
        if skills_in_same_family(r_norm, c_norm):
            return PARTIAL_FAMILY_MATCH * 0.9
    GENERIC = {"sql", "api", "git", "linux"}
    if r in GENERIC:
        return 0.6
    return 0.0


def bucket_coverage(
    bucket: set[str],
    resume_skills: set[str],
) -> float:
    """0–1: average best match per required bucket token (partial credit)."""
    if not bucket:
        return 0.85
    total = 0.0
    for req in bucket:
        total += _best_match_weight(req, resume_skills)
    return clamp(total / max(1, len(bucket)), 0.0, 1.0)


def required_skill_audit(
    must_have: set[str],
    resume_skills: set[str],
) -> tuple[list[str], list[str], float]:
    """
    Lists required skills with meaningful coverage vs missing, plus exact-only coverage.

    - matched_required_skills: req with match weight >= 0.35 (includes partial family credit)
    - missing_required_skills: req with weight < 0.35
    - exact_required_coverage: fraction of must-haves with near-exact match (weight >= 0.99)
    """
    if not must_have:
        return [], [], 1.0
    matched: list[str] = []
    missing: list[str] = []
    exact_hits = 0
    for req in sorted(must_have):
        w = _best_match_weight(req, resume_skills)
        if w >= 0.99:
            matched.append(req)
            exact_hits += 1
        elif w >= 0.35:
            matched.append(req)
        else:
            missing.append(req)
    cov = exact_hits / max(1, len(must_have))
    return matched, missing, round(cov, 4)


def combined_skill_signal(
    must_have: set[str],
    strong: set[str],
    nice: set[str],
    resume_skills: set[str],
) -> tuple[float, float, float]:
    """
    Returns (must_cov, strong_cov, nice_cov) each in [0,1].
    Empty bucket: must→0 (unused when no must-haves), strong/nice→0.85 neutral if absent,
    nice→1.0 when absent (no nice requirements).
    """
    must_cov = bucket_coverage(must_have, resume_skills) if must_have else 0.0
    strong_cov = bucket_coverage(strong, resume_skills) if strong else 0.85
    nice_cov = bucket_coverage(nice, resume_skills) if nice else 1.0
    return must_cov, strong_cov, nice_cov
