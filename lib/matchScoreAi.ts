/**
 * Batched OpenAI semantic match scores for hybrid scoring.
 * Full mode uses lib/matchPipeline: parse → weighted score → explainer (one structured response per batch).
 */

import { fetchOpenAiChatCompletions, isAbortError, openAiChatTimeoutMs } from "@/lib/openaiChat";
import { getAiModelConfig } from "@/lib/ai/modelConfig";
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
  model_used?: string;
  fallback_review_used?: boolean;
};

type CandidateSnippet = {
  id: number;
  full_name: string;
  skills: string | null;
  location: string | null;
  /** Full resume / profile text for semantic JD fit (preferred). */
  resumeText?: string | null;
};

type EvidenceRule = {
  key: string;
  label: string;
  patterns: RegExp[];
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

const COMMON_EVIDENCE_RULES: EvidenceRule[] = [
  { key: "react", label: "React", patterns: [/\breact(?:\.js|js)?\b/i, /\bnext\.?js\b/i] },
  { key: "angular", label: "Angular", patterns: [/\bangular\b/i] },
  { key: "vue", label: "Vue.js", patterns: [/\bvue(?:\.js|js)?\b/i] },
  { key: "typescript", label: "TypeScript", patterns: [/\btypescript\b/i, /\bts\b/i] },
  { key: "javascript", label: "JavaScript", patterns: [/\bjavascript\b/i, /\becmascript\b/i] },
  { key: "node", label: "Node.js", patterns: [/\bnode(?:\.js|js)?\b/i, /\bexpress(?:\.js|js)?\b/i] },
  { key: "python", label: "Python", patterns: [/\bpython\b/i, /\bfastapi\b/i, /\bdjango\b/i, /\bflask\b/i] },
  { key: "java", label: "Java", patterns: [/\bjava\b/i, /\bspring boot\b/i, /\bspring\b/i] },
  { key: "dotnet", label: ".NET / C#", patterns: [/\b\.net\b/i, /\bdotnet\b/i, /\bc#\b/i, /\basp\.?net\b/i] },
  { key: "golang", label: "Go", patterns: [/\bgo(lang)?\b/i] },
  { key: "php", label: "PHP", patterns: [/\bphp\b/i, /\blaravel\b/i] },
  { key: "microservices", label: "Microservices", patterns: [/\bmicroservices?\b/i, /\bservice[-\s]?oriented\b/i] },
  { key: "rest_api", label: "REST APIs", patterns: [/\brest(?:ful)? api(s)?\b/i, /\bapi gateway\b/i, /\bmicroservice api\b/i] },
  { key: "graphql", label: "GraphQL", patterns: [/\bgraphql\b/i] },
  { key: "aws", label: "AWS", patterns: [/\baws\b/i, /\bamazon web services\b/i, /\blambda\b/i, /\bec2\b/i, /\bs3\b/i] },
  { key: "azure", label: "Azure", patterns: [/\bazure\b/i, /\bazure devops\b/i] },
  { key: "gcp", label: "GCP", patterns: [/\bgcp\b/i, /\bgoogle cloud\b/i, /\bbigquery\b/i] },
  { key: "docker", label: "Docker", patterns: [/\bdocker\b/i, /\bcontaineri[sz]ation\b/i] },
  { key: "kubernetes", label: "Kubernetes", patterns: [/\bkubernetes\b/i, /\bk8s\b/i] },
  { key: "terraform", label: "Terraform", patterns: [/\bterraform\b/i, /\binfrastructure as code\b/i] },
  { key: "devops", label: "DevOps", patterns: [/\bdevops\b/i, /\bsre\b/i, /\bsite reliability\b/i] },
  { key: "ci_cd", label: "CI/CD", patterns: [/\bci\/cd\b/i, /\bcontinuous integration\b/i, /\bcontinuous delivery\b/i, /\bjenkins\b/i, /\bgithub actions\b/i, /\bgitlab ci\b/i] },
  { key: "sql", label: "SQL", patterns: [/\bsql\b/i, /\bpostgres(?:ql)?\b/i, /\bmysql\b/i, /\bsql server\b/i, /\boracle\b/i] },
  { key: "data_engineering", label: "Data engineering", patterns: [/\bdata engineering\b/i, /\betl\b/i, /\belt\b/i, /\bdata pipeline(s)?\b/i] },
  { key: "spark", label: "Apache Spark", patterns: [/\bspark\b/i, /\bpyspark\b/i] },
  { key: "airflow", label: "Airflow", patterns: [/\bairflow\b/i] },
  { key: "kafka", label: "Kafka", patterns: [/\bkafka\b/i] },
  { key: "dbt", label: "dbt", patterns: [/\bdbt\b/i] },
  { key: "snowflake", label: "Snowflake", patterns: [/\bsnowflake\b/i] },
  { key: "salesforce", label: "Salesforce", patterns: [/\bsalesforce\b/i, /\bapex\b/i, /\blightning web components?\b/i, /\blwc\b/i, /\bvisualforce\b/i] },
  { key: "qa", label: "QA / testing", patterns: [/\bqa\b/i, /\bquality assurance\b/i, /\btest automation\b/i, /\bmanual testing\b/i] },
  { key: "selenium", label: "Selenium", patterns: [/\bselenium\b/i] },
  { key: "cypress", label: "Cypress", patterns: [/\bcypress\b/i] },
  { key: "playwright", label: "Playwright", patterns: [/\bplaywright\b/i] },
  { key: "api_testing", label: "API testing", patterns: [/\bapi testing\b/i, /\bpostman\b/i, /\bsoapui\b/i] },
  { key: "performance_testing", label: "Performance testing", patterns: [/\bperformance testing\b/i, /\bjmeter\b/i, /\bload testing\b/i] },
  { key: "llm", label: "LLM platforms and model integration", patterns: [/\b(llm|large language model|openai|anthropic|gemini)\b/i] },
  { key: "agent", label: "AI agents and orchestration", patterns: [/\b(agent|agentic|multi-agent|orchestration)\b/i] },
  { key: "langgraph", label: "LangGraph orchestration", patterns: [/\blanggraph\b/i] },
  { key: "rag", label: "RAG pipelines", patterns: [/\b(rag|retrieval augmented generation|retrieval-augmented generation)\b/i] },
  { key: "vector", label: "Vector databases / semantic retrieval", patterns: [/\b(vector dbs?|vector databases?|vectordb|pinecone|weaviate|faiss|milvus|pgvector)\b/i] },
  { key: "prompt", label: "Prompt engineering", patterns: [/\b(prompt engineering|prompting|prompt optimization)\b/i] },
  { key: "voice", label: "Voice / STT / TTS systems", patterns: [/\b(stt|tts|speech to text|text to speech|voice ai|voice bot|voice application)\b/i] },
  { key: "realtime", label: "Realtime systems", patterns: [/\b(realtime|real-time|streaming audio|low-latency)\b/i] },
];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPhrasePattern(phrase: string): RegExp | null {
  const cleaned = phrase
    .trim()
    .replace(/[+/]/g, " ")
    .replace(/\s+/g, " ");
  if (cleaned.length < 3) return null;
  const parts = cleaned
    .split(" ")
    .map((part) => escapeRegex(part))
    .filter(Boolean);
  if (!parts.length) return null;
  return new RegExp(`\\b${parts.join("[\\\\s\\\\-_.]*")}\\b`, "i");
}

function deriveRelevantEvidenceRules(input: {
  jobTitle: string;
  jobDescriptionExcerpt: string;
  mustHave: string[];
  niceToHave: string[];
  keywords: string[];
}): EvidenceRule[] {
  const jdCorpus = [
    input.jobTitle,
    input.jobDescriptionExcerpt,
    ...input.mustHave,
    ...input.niceToHave,
    ...input.keywords,
  ]
    .filter(Boolean)
    .join("\n");
  const rules = COMMON_EVIDENCE_RULES.filter((rule) => rule.patterns.some((pattern) => pattern.test(jdCorpus)));
  const directHints = [...input.mustHave, ...input.niceToHave, ...input.keywords]
    .map((hint) => hint.trim())
    .filter((hint) => hint.length >= 3)
    .slice(0, 64);
  for (const hint of directHints) {
    if (rules.some((rule) => rule.label.toLowerCase() === hint.toLowerCase())) continue;
    const pattern = buildPhrasePattern(hint);
    if (!pattern) continue;
    rules.push({ key: `hint:${hint.toLowerCase()}`, label: hint, patterns: [pattern] });
  }
  return rules;
}

function detectRuleMatches(text: string, rules: EvidenceRule[]): Set<string> {
  const out = new Set<string>();
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) out.add(rule.key);
  }
  return out;
}

function extractEvidenceHighlights(text: string, rules: EvidenceRule[], limit = 6): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 12);
  const picked: string[] = [];
  for (const line of lines) {
    if (!rules.some((rule) => rule.patterns.some((pattern) => pattern.test(line)))) continue;
    if (picked.some((existing) => existing.toLowerCase() === line.toLowerCase())) continue;
    picked.push(line.slice(0, 180));
    if (picked.length >= limit) break;
  }
  return picked;
}

function matchedRuleLabels(keys: Set<string>, rules: EvidenceRule[]): string[] {
  return rules.filter((rule) => keys.has(rule.key)).map((rule) => rule.label);
}

function gapMatchesRule(gap: string, rule: EvidenceRule): boolean {
  const normalized = gap.toLowerCase();
  if (normalized.includes(rule.label.toLowerCase())) return true;
  if (rule.patterns.some((pattern) => pattern.test(gap))) return true;
  return false;
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
  const singleCandidateMode = input.candidates.length === 1;
  const jdMaxChars = singleCandidateMode ? 24_000 : 12_000;
  const resumeMaxChars = singleCandidateMode ? 22_000 : 12_000;

  const jdBlock = [
    `TITLE: ${input.jobTitle}`,
    input.experienceRequirement ? `EXPERIENCE LINE IN JD: ${input.experienceRequirement}` : "",
    `EXTRACTED TOOL/SKILL HINTS (supplementary only; the JD narrative is authoritative): must: ${input.mustHave.join(", ") || "—"} | nice: ${input.niceToHave.join(", ") || "—"} | themes: ${input.keywords.join(", ") || "—"}`,
    `FULL JOB DESCRIPTION (primary source — read responsibilities, scope, seniority, domain):\n${input.jobDescriptionExcerpt.slice(0, jdMaxChars)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const candBlock = input.candidates
    .map((c) => {
      const resume =
        (c.resumeText && c.resumeText.trim().length >= 40
          ? c.resumeText
          : c.skills || "Not specified") || "Not specified";
      return `CANDIDATE_ID ${c.id} | ${c.full_name}\nLocation: ${c.location || "Not specified"}\nFULL RESUME / PROFILE TEXT:\n${resume.slice(0, resumeMaxChars)}`;
    })
    .join("\n\n---\n\n");
  const candidateById = new Map(input.candidates.map((candidate) => [candidate.id, candidate]));
  const relevantEvidenceRules = deriveRelevantEvidenceRules(input);

  /** Default: enterprise full rubric (JD + resume). Set MATCH_AI_LITE=1 for smaller JSON / faster batches. */
  const lite = process.env.MATCH_AI_LITE === "1";

  const marketingExtra =
    jobLooksLikeMarketingInsightsRole(input.jobTitle, input.jobDescriptionExcerpt) ? MARKETING_INSIGHTS_RUBRIC : "";

  const prompt = lite
    ? `You are a principal recruiter. Compare each FULL RESUME to the FULL JOB DESCRIPTION using semantic evidence — NOT keyword or skill-tag tallying.
Treat equivalent experience as a match when the resume proves the work. Across frontend, backend, cloud, DevOps, data, QA, Salesforce, APIs, and AI roles, explicit proven experience should be treated as positive evidence, not generic noise.

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

  const modelConfig = getAiModelConfig();
  const requestRows = async (model: string) => {
    const res = await fetchOpenAiChatCompletions(
      {
        model,
        temperature: Number(process.env.MATCH_OPENAI_TEMPERATURE ?? 0.12),
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You evaluate candidates for enterprise hiring: compare full resume text to the full job description. Use evidence from work history and outcomes; semantic equivalence allowed; no keyword tallying. Treat explicit proven experience across engineering, frontend, backend, cloud, DevOps, data, QA, Salesforce, APIs, and AI as positive evidence when present. JSON only.",
          },
          { role: "user", content: prompt },
        ],
      },
      openAiChatTimeoutMs("match_batch")
    );
    if (!res.ok) throw new Error(`OpenAI matching request failed (${res.status})`);

    const json: unknown = await res.json();
    const text = (json as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenAI matching returned no content");

    const parsed = JSON.parse(text) as { results?: unknown[] };
    const rows = Array.isArray(parsed.results) ? parsed.results : [];
    if (!rows.length) throw new Error("OpenAI matching returned no candidate results");
    return rows;
  };

  try {
    let modelUsed = modelConfig.resumeMatchModel;
    let fallbackReviewUsed = false;
    let rows: unknown[];
    try {
      rows = await requestRows(modelUsed);
    } catch (primaryError) {
      const canFallback = modelConfig.fallbackReviewEnabled && modelConfig.maxFallbackReviewsPerRequest > 0 && modelConfig.fallbackReviewModel !== modelUsed;
      if (!canFallback) throw primaryError;
      console.warn("matchScoreAi: primary model failed; using one bounded fallback review", primaryError);
      modelUsed = modelConfig.fallbackReviewModel;
      fallbackReviewUsed = true;
      rows = await requestRows(modelUsed);
    }
    if (!fallbackReviewUsed && singleCandidateMode && modelConfig.fallbackReviewEnabled && modelConfig.maxFallbackReviewsPerRequest > 0 && modelConfig.fallbackReviewModel !== modelUsed) {
      const raw = rows[0] && typeof rows[0] === "object" ? rows[0] as Record<string, unknown> : null;
      const candidate = input.candidates[0];
      const resumeText = String(candidate?.resumeText || candidate?.skills || "");
      const provenKeys = detectRuleMatches(resumeText, relevantEvidenceRules);
      const provenRules = relevantEvidenceRules.filter(rule => provenKeys.has(rule.key));
      const rawGaps = [...strList(raw?.missing_skills), ...strList(raw?.gaps)];
      const contradictedGaps = rawGaps.filter(gap => provenRules.some(rule => gapMatchesRule(gap, rule))).length;
      const rawScore = raw ? scoreFromOverallOrLegacy(raw) : 0;
      if (rawScore < 70 && contradictedGaps >= 2) {
        console.info("matchScoreAi: escalating one evidence-conflicted result to bounded fallback review", { contradictedGaps, rawScore });
        modelUsed = modelConfig.fallbackReviewModel;
        fallbackReviewUsed = true;
        rows = await requestRows(modelUsed);
      }
    }

    const map = new Map<number, AiMatchResult>();
    for (const r of rows as Record<string, unknown>[]) {
      const id = Number(r.candidate_id);
      if (!Number.isFinite(id)) continue;
      const candidate = candidateById.get(id);
      const resumeText = String(candidate?.resumeText || candidate?.skills || "");
      const resumeEvidenceKeys = detectRuleMatches(resumeText, relevantEvidenceRules);
      const evidenceHighlights = extractEvidenceHighlights(resumeText, relevantEvidenceRules, 4);
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
      let overallScore = reconcileOverallPercentage(modelOverall, category_scores);

      if (relevantEvidenceRules.length > 0 && resumeEvidenceKeys.size > 0) {
        const provenRules = relevantEvidenceRules.filter((rule) => resumeEvidenceKeys.has(rule.key));
        const correctedMissing = missing.filter((gap) => !provenRules.some((rule) => gapMatchesRule(gap, rule)));
        const removedFalseGaps = missing.length - correctedMissing.length;
        if (removedFalseGaps > 0) {
          missing = correctedMissing;
          const correctedGaps = gaps.filter((gap) => !provenRules.some((rule) => gapMatchesRule(gap, rule)));
          if (correctedGaps.length !== gaps.length) {
            gaps.length = 0;
            gaps.push(...correctedGaps);
          }
        }

        if (provenRules.length > 0) {
          const alignedLabels = matchedRuleLabels(new Set(provenRules.map((rule) => rule.key)), relevantEvidenceRules);
          for (const label of alignedLabels) {
            if (!matched.some((item) => item.toLowerCase() === label.toLowerCase())) {
              matched.push(label);
            }
          }
          for (const evidence of evidenceHighlights) {
            if (!matched.some((item) => item.toLowerCase() === evidence.toLowerCase())) {
              matched.push(evidence);
            }
          }
          const evidenceBonus = Math.min(20, provenRules.length * 3 + (removedFalseGaps > 0 ? 4 : 0));
          overallScore = Math.min(100, overallScore + evidenceBonus);
        }
      }

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
      const surfacedStrengths = [...strengths, ...evidenceHighlights]
        .filter((value, index, array) => array.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)
        .slice(0, 8);

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
        strengths: surfacedStrengths.length ? surfacedStrengths : undefined,
        gaps: gaps.length ? gaps : undefined,
        risk_flags: risk_flags.length ? risk_flags : undefined,
        recruiter_decision,
        parsed_profile,
        model_used: modelUsed,
        fallback_review_used: fallbackReviewUsed,
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
