/**
 * Job Match hub bulk actions: "Analyze full JD & resumes", "Hybrid recompute", "Queue analyze (async)".
 *
 * Opt-in: set `NEXT_PUBLIC_MATCH_BULK_UI` to `1`, `true`, or `yes` (case-insensitive) to show them.
 * If unset or any other value, those controls are hidden (Re-score, Check one candidate, Refresh stay).
 */
const raw = (process.env.NEXT_PUBLIC_MATCH_BULK_UI ?? "").trim().toLowerCase();

export const MATCH_BULK_UI_ENABLED = raw === "1" || raw === "true" || raw === "yes";
