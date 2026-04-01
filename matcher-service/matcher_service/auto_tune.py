from __future__ import annotations

import argparse
import itertools
import json

from matcher_service.evaluation import evaluate
from matcher_service.scoring import DEFAULT_WEIGHTS


SEARCH_SPACE = {
    "must": [0.40, 0.45, 0.50, 0.55],
    "strong": [0.10, 0.12, 0.15, 0.18],
    "nice": [0.02, 0.04, 0.05, 0.08],
    "experience": [0.12, 0.15, 0.18],
    "title": [0.08, 0.10, 0.12],
    "recency": [0.02, 0.03, 0.04],
    "domain": [0.02, 0.03, 0.04, 0.05],
    "education": [0.0, 0.01, 0.02],
    "quality": [0.0, 0.01, 0.02],
}


def valid_weights(w: dict[str, float]) -> bool:
    total = sum(w.values())
    return 0.98 <= total <= 1.02


def objective(report: dict) -> float:
    return (
        0.45 * report["proceed_f1"]
        + 0.30 * report["accuracy"]
        + 0.25 * report["top_10_precision"]
    )


def generate_candidates():
    keys = list(SEARCH_SPACE.keys())
    values = [SEARCH_SPACE[k] for k in keys]

    for combo in itertools.product(*values):
        weights = dict(zip(keys, combo))
        if valid_weights(weights):
            yield weights


def main(dataset_path: str, limit: int | None = None):
    best = None
    tried = 0

    for weights in generate_candidates():
        tried += 1
        report = evaluate(dataset_path, weights=weights)
        score = objective(report)

        if best is None or score > best["objective"]:
            best = {
                "objective": round(score, 6),
                "weights": weights,
                "report": report,
            }
            print("\n=== NEW BEST ===")
            print(json.dumps(best, indent=2))

        if limit and tried >= limit:
            break

    print("\n=== FINAL BEST CONFIG ===")
    print(json.dumps(best, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, help="Path to CSV dataset")
    parser.add_argument("--limit", type=int, default=None, help="Optional search limit")
    args = parser.parse_args()

    main(args.dataset, args.limit)