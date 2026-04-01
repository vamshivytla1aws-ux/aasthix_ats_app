/**
 * Models often return score on 0–10 or 0–1 instead of required 0–100.
 * Normalizes to 0–100 for ATS storage and pass threshold (≥70).
 */
export function normalizeEvaluatorScoreTo100(
  raw: unknown,
  qualityFromModel?: "high-quality" | "average" | "weak"
): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 65;

  // 0–1 scale (e.g. 0.87)
  if (n > 0 && n <= 1) {
    return Math.max(0, Math.min(100, Math.round(n * 100)));
  }

  const rounded = Math.round(n);

  // 1–10 (or 1.0–10.0) with positive-ish rubric → treat as out-of-10 → ×10
  if (n > 0 && n <= 10) {
    if (qualityFromModel === "high-quality" || qualityFromModel === "average") {
      return Math.max(0, Math.min(100, Math.round(n * 10)));
    }
  }

  return Math.max(0, Math.min(100, rounded));
}
