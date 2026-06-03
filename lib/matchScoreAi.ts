/**
 * Batched OpenAI semantic match scores for hybrid scoring.
 * Full mode uses lib/matchPipeline: parse → weighted score → explainer (one structured response per batch).
 */

import { fetchOpenAiChatCompletions, isAbortError, openAiChatTimeoutMs } from "@/lib/openaiChat";
import { buildFullRecruiterBatchPrompt } from "@/lib/matchPipeline/recruiterBatchPrompt";
import {
  jobLooksLikeMarketingInsightsRole,
  MARKETING_INSIGHTS_RUBRIC,
} from "@/lib/matchPipeline/marketingInsightsRubric";
import { reconcileOverallPercentage } from "@/lib/matchPipeline/scorer";
import type { AiCategoryScores, ParsedMatchProfile } from "@/lib/matchPipeline/types";

export type { AiCategoryScores, ParsedMatchProfile } from "@/lib/matchPipeline/types";

export type AiMatchResult = {
  candidate_id: number;
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  /** Primary hiring rationale (maps from decision_reason + summary in full rubric). */
  reasoning: string;
  candidate_name?: string;
  decision_reason?: string;
  recruiter_summary?: string;
  /** Legacy / optional JD ↔ resume theme lines. */
  responsibility_comparison?: string[];
  category_scores?: AiCategoryScores;
  strengths?: string[];
  gaps?: string[];
  risk_flags?: string[];
  recruiter_decision?: "Proceed to Interview" | "Hold" | "Reject";
  /** Step 1 structured parse from the recruiter pipeline. */
  parsed_profile?: ParsedMatchProfile;
};

type CandidateSnippet = {
  id: number;
  full_name: string;
  skills: string | null;
  location: string | null;
  /** Full resume / profile text for semantic JD fit (preferred). */
  resumeText?: string | null;
};

function clampScore(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function num01(n: unknown): number | undefined {
  const x = Number(n);
  if (!Number.isFinite(x)) return undefined;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).map((x) => String(x).trim()).filter(Boolean) : [];
}

function parseParsedProfile(raw: unknown): ParsedMatchProfile | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const jd_primary_themes = strList(o.jd_primary_themes).slice(0, 10);
  const resume_domain_evidence = strList(o.resume_domain_evidence).slice(0, 12);
  const tools_evidence = strList(o.tools_evidence).slice(0, 12);
  const impact_evidence = strList(o.impact_evidence).slice(0, 12);
  const stakeholder_evidence = strList(o.stakeholder_evidence).slice(0, 12);
  if (
    !jd_primary_themes.length &&
    !resume_domain_evidence.length &&
    !tools_evidence.length &&
    !impact_evidence.length &&
    !stakeholder_evidence.length
  ) {
    return undefined;
  }
  return {
    jd_primary_themes,
    resume_domain_evidence,
    tools_evidence,
    impact_evidence,
    stakeholder_evidence,
  };
}

/** Map model output to our decision enum (handles "Hold / Secondary Review", etc.). */
function normalizeRecruiterDecision(raw: unknown): "Proceed to Interview" | "Hold" | "Reject" | undefined {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return undefined;
  if (s.includes("reject")) return "Reject";
  if (s.includes("hold") || s.includes("secondary")) return "Hold";
  if (s.includes("proceed") || s.includes("interview")) return "Proceed to Interview";
  return undefined;
}

function scoreFromOverallOrLegacy(r: Record<string, unknown>): number {
  const o = r.overall_match_percentage ?? r.match_score;
  if (typeof o === "string") {
    const n = Number(String(o).replace(/%/g, "").trim());
    return clampScore(n);
  }
  return clampScore(o);
}

export async function scoreCandidatesBatchWithOpenAI(input: {
  jobTitle: string;
  jobDescriptionExcerpt: string;
  experienceRequirement: string | null;
  mustHave: string[];
  niceToHave: string[];
  keywords: string[];
  candidates: CandidateSnippet[];
}): Promise<Map<number, AiMatchResult> | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || input.candidates.length === 0) return null;

  const jdBlock = [
    `TITLE: ${input.jobTitle}`,
    input.experienceRequirement ? `EXPERIENCE LINE IN JD: ${input.experienceRequirement}` : "",
    `EXTRACTED TOOL/SKILL HINTS (supplementary only; the JD narrative is authoritative): must: ${input.mustHave.join(", ") || "—"} | nice: ${input.niceToHave.join(", ") || "—"} | themes: ${input.keywords.join(", ") || "—"}`,
    `FULL JOB DESCRIPTION (primary source — read responsibilities, scope, seniority, domain):\n${input.jobDescriptionExcerpt.slice(0, 12_000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const candBlock = input.candidates
    .map((c) => {
      const resume =
        (c.resumeText && c.resumeText.trim().length >= 40
          ? c.resumeText
          : c.skills || "Not specified") || "Not specified";
      return `CANDIDATE_ID ${c.id} | ${c.full_name}\nLocation: ${c.location || "Not specified"}\nFULL RESUME / PROFILE TEXT:\n${resume.slice(0, 12_000)}`;
    })
    .join("\n\n---\n\n");

  /** Default: enterprise full rubric (JD + resume). Set MATCH_AI_LITE=1 for smaller JSON / faster batches. */
  const lite = process.env.MATCH_AI_LITE === "1";

  const marketingExtra =
    jobLooksLikeMarketingInsightsRole(input.jobTitle, input.jobDescriptionExcerpt) ? MARKETING_INSIGHTS_RUBRIC : "";

  const prompt = lite
    ? `You are a principal recruiter. Compare each FULL RESUME to the FULL JOB DESCRIPTION using semantic evidence — NOT keyword or skill-tag tallying.
Treat equivalent experience as a match when the resume proves the work. For technical and AI roles, explicit LLM, agent, LangGraph, RAG, multi-LLM gateway, prompt engineering, model-orchestration, evaluation, or AI platform work should be treated as positive evidence, not generic backend noise.

Score match_score 0–100 using: domain & role fit 20%, core role competencies 20%, measurable impact 15%, collaboration & stakeholder influence 15%, advanced methods / depth 10%, tools 10%, experience vs JD 10%.

${marketingExtra}

Return ONLY valid JSON:
{
  "results": [
    {
      "candidate_id": number,
      "match_score": number,
      "matched_skills": string[],
      "missing_skills": string[],
      "reasoning": string
    }
  ]
}

RULES
- One entry per candidate_id. matched_skills / missing_skills: short evidence-based phrases (not single buzzwords).

JOB:
${jdBlock}

CANDIDATES:
${candBlock}`
    : buildFullRecruiterBatchPrompt(jdBlock, candBlock, marketingExtra);

  try {
    const res = await fetchOpenAiChatCompletions(
      {
        model: process.env.MATCH_OPENAI_MODEL || "gpt-4o",
        temperature: Number(process.env.MATCH_OPENAI_TEMPERATURE ?? 0.12),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You evaluate candidates for enterprise hiring: compare full resume text to the full job description. Use evidence from work history and outcomes; semantic equivalence allowed; no keyword tallying. For technical and AI roles, treat explicit LLM, agent, LangGraph, RAG, multi-LLM gateway, prompt engineering, model-orchestration, evaluation, or AI platform work as positive evidence when present. JSON only.",
          },
          { role: "user", content: prompt },
        ],
      },
      openAiChatTimeoutMs("match_batch")
    );
    if (!res.ok) return null;

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return null;
    }
    const text = (json as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
    if (!text) return null;

    let parsed: { results?: unknown[] };
    try {
      parsed = JSON.parse(text) as { results?: unknown[] };
    } catch {
      return null;
    }

    const rows = Array.isArray(parsed.results) ? parsed.results : [];
    const map = new Map<number, AiMatchResult>();
    for (const r of rows as Record<string, unknown>[]) {
      const id = Number(r.candidate_id);
      if (!Number.isFinite(id)) continue;
      const strengths = strList(r.strengths).slice(0, 8);
      const gaps = strList(r.gaps).slice(0, 8);
      let matched = strList(r.matched_skills);
      let missing = strList(r.missing_skills);
      if (!matched.length && strengths.length) matched = strengths.slice(0, 10);
      if (!missing.length && gaps.length) missing = gaps.slice(0, 10);

      const decisionReason = String(r.decision_reason || "").trim();
      const recruiterSummary = String(r.summary || "").trim();
      const legacyReason = String(r.reasoning || "").trim();
      const reasoning = [decisionReason, recruiterSummary, legacyReason].filter(Boolean).join("\n\n").slice(0, 2000);

      const respComp = strList(r.responsibility_comparison).slice(0, 8);
      const risk_flags = strList(r.risk_flags).slice(0, 6);
      const parsed_profile = parseParsedProfile(r.parsed);

      const candidate_name = String(r.candidate_name || "").trim() || undefined;

      const cs = r.category_scores as Record<string, unknown> | undefined;
      let category_scores: AiCategoryScores | undefined;
      if (cs && typeof cs === "object") {
        const domain_relevance = num01(cs.domain_relevance);
        const core_skills = num01(cs.core_skills);
        const business_impact = num01(cs.business_impact);
        const stakeholder_management = num01(cs.stakeholder_management);
        const advanced_analytics = num01(cs.advanced_analytics);
        const tools_tech = num01(cs.tools_tech);
        const experience = num01(cs.experience);
        if (
          domain_relevance != null &&
          core_skills != null &&
          business_impact != null &&
          stakeholder_management != null &&
          advanced_analytics != null &&
          tools_tech != null &&
          experience != null
        ) {
          category_scores = {
            domain_relevance,
            core_skills,
            business_impact,
            stakeholder_management,
            advanced_analytics,
            tools_tech,
            experience,
          };
        }
      }

      const modelOverall = scoreFromOverallOrLegacy(r);
      const overallScore = reconcileOverallPercentage(modelOverall, category_scores);

      let recruiter_decision =
        normalizeRecruiterDecision(r.decision) ?? normalizeRecruiterDecision(r.recruiter_decision);
      if (!recruiter_decision && r.recruiter_decision === "Proceed to Interview") recruiter_decision = "Proceed to Interview";
      if (!recruiter_decision && r.recruiter_decision === "Hold") recruiter_decision = "Hold";
      if (!recruiter_decision && r.recruiter_decision === "Reject") recruiter_decision = "Reject";
      if (!recruiter_decision) {
        if (overallScore >= 80) recruiter_decision = "Proceed to Interview";
        else if (overallScore >= 65) recruiter_decision = "Hold";
        else recruiter_decision = "Reject";
      }

      map.set(id, {
        candidate_id: id,
        match_score: overallScore,
        matched_skills: matched,
        missing_skills: missing,
        reasoning: reasoning || legacyReason.slice(0, 900),
        candidate_name,
        decision_reason: decisionReason || undefined,
        recruiter_summary: recruiterSummary || undefined,
        responsibility_comparison: respComp.length ? respComp : undefined,
        category_scores,
        strengths: strengths.length ? strengths : undefined,
        gaps: gaps.length ? gaps : undefined,
        risk_flags: risk_flags.length ? risk_flags : undefined,
        recruiter_decision,
        parsed_profile,
      });
    }
    return map.size ? map : null;
  } catch (e) {
    if (isAbortError(e)) {
      console.error("matchScoreAi: OpenAI request timed out (MATCH_OPENAI_BATCH_TIMEOUT_MS / MATCH_OPENAI_TIMEOUT_MS)");
    } else {
      console.error("matchScoreAi:", e);
    }
    return null;
  }
}
