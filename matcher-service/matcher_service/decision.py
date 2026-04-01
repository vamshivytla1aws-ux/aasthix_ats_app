"""Deterministic hire_probability + decision — stricter for must-have gaps, more realistic probability scaling."""
from __future__ import annotations

from matcher_service.normalization import clamp


def compute_hire_probability(
    match_score: int,
    effective_fit: float,
    exp_shortfall: float,
) -> int:
    """
    match_score: 0-100 headline score
    effective_fit: 0-1 composite fit driven mostly by must-have coverage
    exp_shortfall: years short vs JD minimum, else 0
    """
    prob = float(match_score)

    # Stronger penalty only when fit is truly weak
    if effective_fit < 0.20:
        prob *= 0.45
    elif effective_fit < 0.35:
        prob *= 0.65
    elif effective_fit < 0.50:
        prob *= 0.82
    elif effective_fit < 0.65:
        prob *= 0.92

    # Penalize experience shortfall, but not so aggressively that all mids become 1-5%
    if exp_shortfall > 0:
        if exp_shortfall >= 4:
            prob -= 20.0
        elif exp_shortfall >= 2:
            prob -= 12.0
        else:
            prob -= 6.0

    return int(round(clamp(prob, 5.0, 95.0)))


def compute_decision(match_score: int, effective_fit: float, exp_shortfall: float) -> str:
    if effective_fit < 0.20:
        return "Reject"

    if exp_shortfall >= 4:
        return "Reject"

    if match_score >= 82 and effective_fit >= 0.62 and exp_shortfall <= 1:
        return "Proceed"

    if match_score >= 72 and effective_fit >= 0.55 and exp_shortfall <= 2:
        return "Proceed"

    if match_score >= 58 and effective_fit >= 0.38:
        return "Hold"

    return "Reject"