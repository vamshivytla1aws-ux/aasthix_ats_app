from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from statistics import mean

from matcher_service.parsing import parse_jd, parse_resume
from matcher_service.scoring import score_candidate, DEFAULT_WEIGHTS


def normalize_label(label: str) -> str:
    x = (label or "").strip().lower()

    mapping = {
        "proceed": "Proceed",
        "selected": "Proceed",
        "shortlist": "Proceed",
        "shortlisted": "Proceed",
        "yes": "Proceed",

        "hold": "Hold",
        "maybe": "Hold",
        "review": "Hold",
        "consider": "Hold",

        "reject": "Reject",
        "rejected": "Reject",
        "no": "Reject",
    }

    return mapping.get(x, "Reject")



def load_dataset(csv_path: str) -> list[dict]:
    import csv

    rows: list[dict] = []

    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=",", quotechar='"')
        fieldnames = reader.fieldnames or []
        print("Detected CSV columns:", fieldnames)

        # Normal CSV case
        if len(fieldnames) > 1:
            for i, row in enumerate(reader, start=1):
                raw_label = row.get("recruiter_label", "")
                normalized = normalize_label(raw_label)

                print(f"Row {i} raw recruiter_label = {repr(raw_label)} -> normalized = {normalized}")

                rows.append(
                    {
                        "job_id": (row.get("job_id") or "").strip(),
                        "candidate_id": (row.get("candidate_id") or "").strip(),
                        "jd_text": row.get("jd_text") or "",
                        "resume_text": row.get("resume_text") or "",
                        "recruiter_label": normalized,
                    }
                )
            return rows

    # Fallback for broken single-column CSV
    print("CSV fallback mode: single-column rows detected, reparsing manually")

    with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f, delimiter=",", quotechar='"')
        raw_headers = reader.fieldnames[0]
        headers = next(csv.reader([raw_headers], delimiter=",", quotechar='"'))
        print("Fallback parsed headers:", headers)

        for i, row in enumerate(reader, start=1):
            only_key = next(iter(row.keys()))
            only_val = row.get(only_key)
            raw_line = only_val if only_val is not None else only_key

            values = next(csv.reader([raw_line], delimiter=",", quotechar='"'))

            if len(values) != len(headers):
                print(f"WARNING: Row {i} column mismatch: {values}")
                continue

            fixed = dict(zip(headers, values))
            raw_label = fixed.get("recruiter_label", "")
            normalized = normalize_label(raw_label)

            print(f"Row {i} raw recruiter_label = {repr(raw_label)} -> normalized = {normalized}")

            rows.append(
                {
                    "job_id": (fixed.get("job_id") or "").strip(),
                    "candidate_id": (fixed.get("candidate_id") or "").strip(),
                    "jd_text": fixed.get("jd_text") or "",
                    "resume_text": fixed.get("resume_text") or "",
                    "recruiter_label": normalized,
                }
            )

    return rows
def confusion_matrix(rows: list[dict]) -> dict:
    labels = ["Proceed", "Hold", "Reject"]
    matrix = {a: {b: 0 for b in labels} for a in labels}
    for row in rows:
        matrix[row["actual"]][row["predicted"]] += 1
    return matrix


def precision_recall_f1(rows: list[dict], positive_label: str = "Proceed") -> dict:
    tp = fp = fn = 0
    for row in rows:
        actual = row["actual"]
        pred = row["predicted"]
        if pred == positive_label and actual == positive_label:
            tp += 1
        elif pred == positive_label and actual != positive_label:
            fp += 1
        elif pred != positive_label and actual == positive_label:
            fn += 1

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }


def top_k_precision(grouped_rows: dict[str, list[dict]], k: int = 10) -> float:
    scores = []
    for _, items in grouped_rows.items():
        ranked = sorted(items, key=lambda x: x["match_score"], reverse=True)[:k]
        if not ranked:
            continue
        good = sum(1 for x in ranked if x["actual"] == "Proceed")
        scores.append(good / len(ranked))
    return round(mean(scores), 4) if scores else 0.0


def evaluate(dataset_path: str, weights: dict[str, float] | None = None) -> dict:
    data = load_dataset(dataset_path)
    weights = weights or DEFAULT_WEIGHTS

    results = []
    grouped = defaultdict(list)
    jd_cache = {}

    for row in data:
        jd_text = row["jd_text"]
        resume_text = row["resume_text"]

        if jd_text not in jd_cache:
            jd_cache[jd_text] = parse_jd(jd_text)
        parsed_jd = jd_cache[jd_text]

        parsed_resume = parse_resume(resume_text)
        scored = score_candidate(parsed_jd, parsed_resume, weights=weights)

        item = {
            "job_id": row["job_id"],
            "candidate_id": row["candidate_id"],
            "actual": row["recruiter_label"],
            "predicted": scored.decision,
            "match_score": scored.match_score,
            "hire_probability": scored.hire_probability,
        }
        results.append(item)
        grouped[row["job_id"]].append(item)

    accuracy = sum(1 for x in results if x["actual"] == x["predicted"]) / len(results) if results else 0.0

    score_by_label = defaultdict(list)
    for row in results:
        score_by_label[row["actual"]].append(row["match_score"])

    matrix = confusion_matrix(results)
    prf = precision_recall_f1(results, positive_label="Proceed")

    report = {
        "rows": len(results),
        "accuracy": round(accuracy, 4),
        "proceed_precision": prf["precision"],
        "proceed_recall": prf["recall"],
        "proceed_f1": prf["f1"],
        "top_5_precision": top_k_precision(grouped, k=5),
        "top_10_precision": top_k_precision(grouped, k=10),
        "avg_score_proceed": round(mean(score_by_label["Proceed"]), 2) if score_by_label["Proceed"] else 0.0,
        "avg_score_hold": round(mean(score_by_label["Hold"]), 2) if score_by_label["Hold"] else 0.0,
        "avg_score_reject": round(mean(score_by_label["Reject"]), 2) if score_by_label["Reject"] else 0.0,
        "confusion_matrix": matrix,
    }
    return report


def print_report(report: dict):
    print("\n=== MATCHER EVALUATION REPORT ===")
    print(f"Rows: {report['rows']}")
    print(f"Accuracy: {report['accuracy']}")
    print(f"Proceed Precision: {report['proceed_precision']}")
    print(f"Proceed Recall: {report['proceed_recall']}")
    print(f"Proceed F1: {report['proceed_f1']}")
    print(f"Top-5 Precision: {report['top_5_precision']}")
    print(f"Top-10 Precision: {report['top_10_precision']}")
    print(f"Avg Score (Proceed): {report['avg_score_proceed']}")
    print(f"Avg Score (Hold): {report['avg_score_hold']}")
    print(f"Avg Score (Reject): {report['avg_score_reject']}")
    print("\nConfusion Matrix:")
    for actual, preds in report["confusion_matrix"].items():
        print(actual, preds)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True, help="Path to CSV dataset")
    args = parser.parse_args()

    report = evaluate(args.dataset)
    print_report(report)