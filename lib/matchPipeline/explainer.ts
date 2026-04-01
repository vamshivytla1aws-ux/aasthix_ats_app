/**
 * Step 3 — EXPLAINER (instructions for the LLM).
 */

export const EXPLAINER_OUTPUT_SPEC = `STEP 3 — EXPLAINER (after scores are fixed)
Using the same evidence mindset (not keywords):
- strengths: 3–8 specific bullets tied to JD priorities
- gaps: 3–8 honest gaps vs JD (missing marketing/campaign depth if JD centers on it, etc.)
- risk_flags: 0–5 hiring risks (title inflation, domain drift, tenure, scope mismatch)
- summary: 2–4 sentences, recruiter voice
- decision: must match thresholds vs final match percentage
- decision_reason: one tight paragraph linking decision to evidence`;
