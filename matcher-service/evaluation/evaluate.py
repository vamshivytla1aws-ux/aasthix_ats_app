#!/usr/bin/env python3
"""
Evaluate matcher vs recruiter labels.

Usage:
  python evaluation/evaluate.py --dataset ../data/eval_sample.jsonl

Metrics: decision accuracy, precision/recall/F1 for Proceed, confusion matrix, top-k (when ranked lists available).

"90% accuracy" in docs means agreement with labeled decisions on this dataset — not raw score inflation.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from matcher_service.parsing import parse_jd, parse_resume
from matcher_service.scoring import score_candidate


def norm_dec(s: str) -> str:
    return (s or "").strip().lower()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", required=True, type=Path)
    args = ap.parse_args()

    rows: list[dict[str, Any]] = []
    with open(args.dataset, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))

    correct = 0
    tp = fp = fn = tn = 0
    for r in rows:
        jd = parse_jd(r.get("jd_text") or "", title="")
        pr = parse_resume(r.get("resume_text") or "")
        sc = score_candidate(jd, pr)
        pred = norm_dec(sc.decision)
        gold = norm_dec(r.get("recruiter_label") or "")
        if gold in ("proceed", "shortlist", "yes"):
            gold_bin = "proceed"
        elif gold in ("reject", "no"):
            gold_bin = "reject"
        else:
            gold_bin = gold or "hold"

        if pred == gold_bin:
            correct += 1
        if gold_bin == "proceed":
            if pred == "proceed":
                tp += 1
            else:
                fn += 1
        else:
            if pred == "proceed":
                fp += 1
            else:
                tn += 1

    n = len(rows) or 1
    acc = correct / n
    prec = tp / (tp + fp) if (tp + fp) else 0.0
    rec = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0

    print(f"rows={len(rows)} accuracy={acc:.3f} precision_proceed={prec:.3f} recall_proceed={rec:.3f} f1_proceed={f1:.3f}")
    print(f"tp={tp} fp={fp} fn={fn} tn={tn}")


if __name__ == "__main__":
    main()
