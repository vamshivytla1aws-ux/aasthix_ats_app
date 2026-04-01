/**
 * Extra rubric when the JD is marketing / business insights / engagement-partner shaped.
 * Rewards campaign analytics, funnel, customer journey; dampens generic BA-only profiles.
 */

export function jobLooksLikeMarketingInsightsRole(jobTitle: string, jobDescription: string): boolean {
  const t = `${jobTitle}\n${jobDescription}`.toLowerCase();
  const signals = [
    "marketing analytics",
    "campaign",
    "customer journey",
    "funnel",
    "business insights",
    "engagement partner",
    "sales funnel",
    "digital analytics",
    "marketing performance",
    "growth analytics",
    "cac",
    "roas",
    "attribution",
  ];
  return signals.some((s) => t.includes(s));
}

export const MARKETING_INSIGHTS_RUBRIC = `
ROLE FLAVOR — MARKETING / BUSINESS INSIGHTS / ENGAGEMENT PARTNER (when JD matches this family)
This is NOT a generic reporting BA role. Calibrate scores accordingly.

WEIGHTS (must drive category_scores, then final %):
- domain_relevance (20%): HIGH weight on marketing analytics, campaign/journey/funnel, commercial customer behavior. Penalize domain mismatch heavily (e.g. pure internal IT BA with no commercial/marketing analytics story).
- core_skills (20%): Core = insights for marketing/sales growth — segmentation, experimentation mindset, performance reporting, not just requirements gathering.
- business_impact (15%): Reward quantified revenue, savings, conversion, growth, efficiency with numbers.
- stakeholder_management (15%): Partnering with marketing/sales leadership, storytelling to executives.
- advanced_analytics (10%): Secondary here — ML/statistics nice-to-have; do NOT over-reward ML if JD makes it secondary.
- tools_tech (10%): Tableau/Power BI/SQL/Excel etc. matter but are supporting vs marketing insights substance.
- experience (10%): Years + relevance of marketing/commercial analytics scope vs JD seniority.

GENERIC BUSINESS ANALYST PENALTY:
If the resume is mostly generic BA (backlog, UAT, wireframes) without commercial/marketing/campaign/funnel evidence, cap domain_relevance and core_skills appropriately — typically overall should land ~55–68 unless strong transferable proof exists.

HIGH-FIT PROFILE (semantic, not keywords):
Reward demonstrated campaign performance, CAC/ROAS/CTR, segmentation, dashboarding for marketing/sales, and measurable business outcomes — even if job titles differ (e.g. growth, commercial analytics, marketing intelligence).
`;
