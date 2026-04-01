import { PARSER_OUTPUT_SPEC } from "@/lib/matchPipeline/parser";
import { EXPLAINER_OUTPUT_SPEC } from "@/lib/matchPipeline/explainer";
import { CATEGORY_WEIGHTS } from "@/lib/matchPipeline/scorer";

const WEIGHT_LINES = (Object.keys(CATEGORY_WEIGHTS) as (keyof typeof CATEGORY_WEIGHTS)[])
  .map((k) => `- ${k}: ${Math.round(CATEGORY_WEIGHTS[k] * 100)}%`)
  .join("\n");

export function buildFullRecruiterBatchPrompt(jdBlock: string, candBlock: string, marketingInsightsExtra: string): string {
  return `You are a principal recruiter conducting real hiring. You do NOT keyword-match. You read meaning, evidence, and business context.

WORKFLOW (execute in order; single JSON response per candidate):

${PARSER_OUTPUT_SPEC}

STEP 2 — SCORER
Assign category_scores (each 0–100 integer) using this weight map for how important each dimension is to the FINAL match:
${WEIGHT_LINES}

Interpretation:
- domain_relevance: fit of industry/problem domain and role type vs JD (semantic).
- core_skills: substantive abilities the JD requires (for insights roles: analytics for commercial/marketing outcomes, not generic BA paperwork unless JD is generic).
- business_impact: evidence of measurable outcomes.
- stakeholder_management: influence, partnership, exec/customer communication as JD requires.
- advanced_analytics: depth in stats/ML/experimentation — only weight high if JD emphasizes it; otherwise moderate.
- tools_tech: BI/SQL/stack evidenced vs asked.
- experience: seniority and years vs JD.

After setting category_scores, overall_match_percentage MUST equal this weighted average (integers 0–100):
round(0.25×domain_relevance + 0.20×core_skills + 0.15×business_impact + 0.15×stakeholder_management + 0.10×advanced_analytics + 0.10×tools_tech + 0.05×experience)
Do not report a different overall than this formula.

${EXPLAINER_OUTPUT_SPEC}

DECISION (from overall_match_percentage)
- ≥80 → "Proceed to Interview"
- 65–79 → "Hold"
- <65 → "Reject"

${marketingInsightsExtra}

Return ONLY valid JSON:
{
  "results": [
    {
      "candidate_id": number,
      "candidate_name": string,
      "parsed": {
        "jd_primary_themes": string[],
        "resume_domain_evidence": string[],
        "tools_evidence": string[],
        "impact_evidence": string[],
        "stakeholder_evidence": string[]
      },
      "category_scores": {
        "domain_relevance": number,
        "core_skills": number,
        "business_impact": number,
        "stakeholder_management": number,
        "advanced_analytics": number,
        "tools_tech": number,
        "experience": number
      },
      "overall_match_percentage": number,
      "decision": "Proceed to Interview" | "Hold" | "Reject",
      "decision_reason": string,
      "strengths": string[],
      "gaps": string[],
      "risk_flags": string[],
      "summary": string,
      "matched_skills": string[],
      "missing_skills": string[]
    }
  ]
}

RULES
- One object per candidate_id from the input; candidate_id must match exactly.
- parsed lists: non-empty when evidence exists; use short clauses.
- matched_skills / missing_skills: semantic fit phrases (evidence-based), not keyword dumps.

JOB:
${jdBlock}

CANDIDATES:
${candBlock}`;
}
