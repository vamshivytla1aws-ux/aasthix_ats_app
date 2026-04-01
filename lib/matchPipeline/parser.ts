/**
 * Step 1 — PARSER (instructions for the LLM; semantic extraction, not keyword rules).
 */

export const PARSER_OUTPUT_SPEC = `STEP 1 — PARSER (do this first, internally)
From the JD, infer primary hiring themes (e.g. marketing analytics, funnel, stakeholder engagement).
From each resume, extract concise evidence lists (paraphrase; quote short fragments only when helpful):
- jd_primary_themes: string[] (3–8 themes the JD actually emphasizes)
- resume_domain_evidence: string[] (proof of domain work: campaigns, journey, funnel, growth, insights — semantic equivalents count)
- tools_evidence: string[] (BI, SQL, Excel, Tableau, Power BI, etc. only if evidenced)
- impact_evidence: string[] (quantified outcomes: revenue, savings, growth, KPI movement, efficiency)
- stakeholder_evidence: string[] (execs, partners, cross-functional, customer-facing influence)

Do NOT score in this step; only structure what you understood.`;
