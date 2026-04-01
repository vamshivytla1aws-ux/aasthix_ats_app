from __future__ import annotations

from pydantic import BaseModel, Field


class CandidateIn(BaseModel):
    id: str
    resume: str = ""


class MatchRequest(BaseModel):
    jd: str = Field(..., min_length=1)
    candidates: list[CandidateIn] = Field(default_factory=list)


class MatchRowOut(BaseModel):
    id: str
    match_score: int = Field(ge=0, le=100)
    hire_probability: int = Field(ge=0, le=100)
    decision: str
    matched_required_skills: list[str] = Field(default_factory=list)
    missing_required_skills: list[str] = Field(default_factory=list)
    exact_required_coverage: float = Field(default=0.0, ge=0.0, le=1.0)
    title_match: float = Field(default=0.0, ge=0.0, le=1.0)
    domain_match: bool = False
    qualification_gate_failed: bool = False


class MatchResponse(BaseModel):
    top_10: list[MatchRowOut]
    all_results: list[MatchRowOut]
    meta: dict

