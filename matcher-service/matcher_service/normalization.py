"""Shared text helpers for the No-AI matcher (deterministic)."""
from __future__ import annotations

import re
from typing import Iterable, TypeVar

T = TypeVar("T")


def normalize_text(s: str) -> str:
    """Lowercase, collapse whitespace, strip control chars for comparison."""
    if not s:
        return ""
    t = s.replace("\r", "\n")
    t = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", t)
    t = t.lower().strip()
    t = re.sub(r"\s+", " ", t)
    return t


def normalize_title(s: str) -> str:
    """Normalize job/title lines: punctuation-light tokens for overlap."""
    if not s:
        return ""
    t = normalize_text(s)
    t = re.sub(r"[^\w\s+/\-#.]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def unique_preserve_order(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in items:
        k = x.strip().lower()
        if not k or k in seen:
            continue
        seen.add(k)
        out.append(x.strip())
    return out
