/**
 * Single JD ↔ resume evaluation (ChatGPT-style “core engine”).
 * Uses the same OpenAI HTTP path as the rest of the ATS (timeouts, no openai SDK).
 */

import { fetchOpenAiChatCompletions, isAbortError, openAiChatTimeoutMs } from "@/lib/openaiChat";
import { getAiModelConfig } from "@/lib/ai/modelConfig";
import { getMatchCache, matchCacheKey, setMatchCache } from "@/lib/aiMatcher/matchCache";
import { isCompleteCategoryScores, reconcileOverallPercentage } from "@/lib/matchPipeline/scorer";
import type { AiCategoryScores } from "@/lib/matchPipeline/types";
import {
  applyPrimaryDomainGate,
  evaluatePrimaryDomainGate,
  MATCH_RUBRIC_VERSION,
  MATCH_SCORING_POLICY_VERSION,
} from "@/lib/singleMatch/domainGate";

export type AiEvaluationResult = {
  candidate_name: string;
  match_score: number;
  decision: "Proceed to Interview" | "Hold" | "Reject" | string;
  strengths: string[];
  gaps: string[];
  risks: string[];
  summary: string;
  category_scores?: AiCategoryScores;
  scoring_unavailable?: boolean;
  scoring_policy_version?: string;
  rubric_version?: string;
};

function clampInt(n: unknown, fallback: number): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).map((x) => String(x).trim()).filter(Boolean) : [];
}

function parseCategories(raw: unknown): AiCategoryScores | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const keys: (keyof AiCategoryScores)[] = [
    "domain_relevance",
    "core_skills",
    "business_impact",
    "stakeholder_management",
    "advanced_analytics",
    "tools_tech",
    "experience",
  ];
  const out: Partial<AiCategoryScores> = {};
  for (const k of keys) {
    const v = o[k];
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return undefined;
    out[k] = Math.max(0, Math.min(100, Math.round(n)));
  }
  return out as AiCategoryScores;
}

function normalizeDecision(
  raw: string,
  score: number
): "Proceed to Interview" | "Hold" | "Reject" {
  const s = raw.toLowerCase();
  if (s.includes("reject")) return "Reject";
  if (s.includes("hold") || s.includes("secondary")) return "Hold";
  if (s.includes("proceed") || s.includes("interview")) return "Proceed to Interview";
  if (score >= 80) return "Proceed to Interview";
  if (score >= 65) return "Hold";
  return "Reject";
}

/** Neutral score when OpenAI is rate-limited, down, or returns errors — does not surface raw HTTP text in gaps (UI-safe). */
function aiTemporarilyUnavailable(candidateNameHint?: string, debugNote?: string): AiEvaluationResult {
  return {
    candidate_name: String(candidateNameHint || "Unknown").trim() || "Unknown",
    match_score: 0,
    decision: "Reject",
    strengths: [],
    gaps: [],
    risks: process.env.MATCH_DEBUG === "1" && debugNote ? [debugNote] : [],
    summary: "Scoring unavailable. No hiring score was produced.",
    scoring_unavailable: true,
    scoring_policy_version: MATCH_SCORING_POLICY_VERSION,
    rubric_version: MATCH_RUBRIC_VERSION,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const SYSTEM =
  "You are a senior recruiter hiring for technical, AI, software, and analytics roles. Output only valid JSON. Score using semantic evidence — not keyword matching. Treat explicit LLM, agent, LangGraph, RAG, multi-LLM gateway, prompt engineering, and model-orchestration experience as positive experience evidence when present.";

/** Deterministic +10-15 boost when resume/JD show strong evidence the model should not underweight. */
function applyEvidenceBoost(
  score: number,
  categories: AiCategoryScores | undefined,
  resume: string,
  jd: string
): number {
  const resumeText = resume.toLowerCase();
  const jdText = jd.toLowerCase();
  const marketingResume =
    /campaign\s*analytics|marketing\s*analytics|marketing\s*insights|funnel|customer\s*journey|attribution|\broas\b|\bcac\b|marketing\s*performance|revenue.{0,40}marketing|marketing.{0,40}revenue|growth\s*marketing/.test(
      resumeText
    );
  const marketingJd = /marketing\s*analytics|marketing\s*insights|funnel|customer\s*journey|attribution|\broas\b|\bcac\b/.test(jdText);
  const aiResume =
    /\b(llm|large language model|langgraph|rag|agent(?:ic)?|multi[-\s]?llm|model\s*orchestration|prompt engineering|vector database|openai|anthropic|gemini|perplexity)\b/.test(
      resumeText
    );
  const aiJd = /\b(llm|large language model|langgraph|rag|agent(?:ic)?|vector database|prompt engineering)\b/.test(jdText);
  if (!(marketingResume && marketingJd) && !(aiResume && aiJd)) return score;
  const domain = categories?.domain_relevance ?? 0;
  if (domain < 55 && score < 55) return score;
  return Math.min(100, score + 4);
}

/**
 * Evaluate one resume against one JD. Results are cached by hash(JD + resume) unless MATCH_AI_CACHE_DISABLED=1.
 */
export async function evaluateCandidate(jd: string, resume: string, candidateNameHint?: string): Promise<AiEvaluationResult> {
  const model = getAiModelConfig().resumeMatchModel;
  const key = matchCacheKey(jd, resume, `${model}:${MATCH_SCORING_POLICY_VERSION}:${MATCH_RUBRIC_VERSION}`);
  const hit = getMatchCache<AiEvaluationResult>(key);
  if (hit) return hit;

  const prompt = `You are a Senior Recruiter hiring for technical, AI, software, analytics, and product roles.

IMPORTANT PRIORITY (evidence first):
- Follow the JD domain and seniority first, then score the resume based on demonstrated work history and outcomes.
- Treat explicit LLM, agent, LangGraph, RAG, multi-LLM gateway, prompt engineering, model orchestration, vector database, evaluation, or AI platform experience as real positive evidence when the JD asks for AI/ML/automation/software depth.
- Do NOT under-score resumes that prove AI system work simply because the title says "backend" or "platform".
- Do NOT over-score generic tool lists without evidence of delivered work.

SCORING — set each category_scores field 0–100 (integers). Final match_score MUST equal:
round(0.25*domain_relevance + 0.20*core_skills + 0.15*business_impact + 0.15*stakeholder_management + 0.10*advanced_analytics + 0.10*tools_tech + 0.05*experience)

WEIGHTS:
- Domain Relevance → 25% (MOST IMPORTANT)
- Core Skills → 20%
- Business Impact → 15%
- Stakeholder Mgmt → 15%
- Advanced Analytics / AI Depth → 10%
- Tools / Stack → 10%
- Experience → 5%

HARD BOOST (apply mentally before finalizing match_score):
If the resume demonstrates explicit LLM, agent, LangGraph, RAG, AI platform, or model-orchestration work that aligns with the JD, increase the FINAL match_score by roughly 10–15 points versus an otherwise similar profile without that evidence (cap at 100).

CALIBRATION — avoid clustering everyone at 65–75:
- Strong fit with clear domain evidence → 80–92
- Moderate / mixed fit → roughly 58–72
- Weak fit / domain mismatch → below 58

STRICT RULES:
- Penalize domain mismatch heavily.
- Advanced analytics / ML is secondary unless the JD makes it primary.

DECISION (must align with final match_score):
≥80 → Proceed to Interview
65–79 → Hold
<65 → Reject

RETURN STRICT JSON ONLY:
{
  "candidate_name": string,
  "match_score": number,
  "category_scores": {
    "domain_relevance": number,
    "core_skills": number,
    "business_impact": number,
    "stakeholder_management": number,
    "advanced_analytics": number,
    "tools_tech": number,
    "experience": number
  },
  "decision": "Proceed to Interview" | "Hold" | "Reject",
  "strengths": string[],
  "gaps": string[],
  "risks": string[],
  "summary": string
}

${candidateNameHint ? `Preferred candidate name if known from resume: ${candidateNameHint}\n` : ""}
JD:
${jd.slice(0, 14_000)}

RESUME:
${resume.slice(0, 16_000)}`;

  /** Total HTTP attempts (default 4 ≈ 1 try + 3 retries on 429). */
  const maxAttempts = Math.min(8, Math.max(1, Number(process.env.MATCH_OPENAI_MAX_ATTEMPTS ?? 4)));
  const baseDelayMs = Math.min(60_000, Math.max(300, Number(process.env.MATCH_OPENAI_RETRY_DELAY_MS ?? 1500)));

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let res: Response;
      try {
        res = await fetchOpenAiChatCompletions(
          {
            model: getAiModelConfig().resumeMatchModel,
            temperature: Number(process.env.MATCH_OPENAI_TEMPERATURE ?? 0.18),
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: prompt },
            ],
          },
          openAiChatTimeoutMs("match_batch")
        );
      } catch (e) {
        if (isAbortError(e)) {
          return aiTemporarilyUnavailable(candidateNameHint, "timeout");
        }
        if (attempt < maxAttempts - 1) {
          console.warn("evaluateCandidate: fetch error, retrying", attempt + 1, e);
          await sleep(baseDelayMs * (attempt + 1));
          continue;
        }
        console.error("evaluateCandidate", e);
        return aiTemporarilyUnavailable(candidateNameHint, "fetch failed");
      }

      if (res.ok) {
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = json?.choices?.[0]?.message?.content;
        if (!text) {
          return aiTemporarilyUnavailable(candidateNameHint, "empty model response");
        }
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch {
          return aiTemporarilyUnavailable(candidateNameHint, "json parse");
        }

        const category_scores = parseCategories(parsed.category_scores);
        let match_score = clampInt(parsed.match_score, 50);
        if (category_scores && isCompleteCategoryScores(category_scores)) {
          match_score = reconcileOverallPercentage(match_score, category_scores);
        }
        match_score = applyEvidenceBoost(match_score, category_scores, resume, jd);
        const domainGate = evaluatePrimaryDomainGate({ jobTitle: "", jobDescription: jd, mustHave: [], resumeText: resume });
        match_score = applyPrimaryDomainGate(match_score, domainGate);

        const out: AiEvaluationResult = {
          candidate_name: String(parsed.candidate_name || candidateNameHint || "Unknown").trim() || "Unknown",
          match_score,
          decision:
            domainGate?.decision_ceiling === "Reject"
              ? "Reject"
              : domainGate?.decision_ceiling === "Hold"
                ? "Hold"
                : normalizeDecision(String(parsed.decision || ""), match_score),
          strengths: strArr(parsed.strengths).slice(0, 12),
          gaps: strArr(parsed.gaps).slice(0, 12),
          risks: strArr(parsed.risks).slice(0, 10),
          summary: String(parsed.summary || "").trim() || "—",
          scoring_policy_version: MATCH_SCORING_POLICY_VERSION,
          rubric_version: MATCH_RUBRIC_VERSION,
          ...(category_scores && isCompleteCategoryScores(category_scores) ? { category_scores } : {}),
        };

        setMatchCache(key, out);
        return out;
      }

      const status = res.status;
      const retryable = status === 429 || status === 408 || status === 502 || status === 503;
      if (retryable && attempt < maxAttempts - 1) {
        let waitMs = baseDelayMs * (attempt + 1);
        const ra = res.headers.get("retry-after");
        if (ra) {
          const sec = Number(ra);
          if (Number.isFinite(sec)) {
            waitMs = Math.min(120_000, Math.max(500, sec * 1000));
          } else {
            const httpDate = Date.parse(ra);
            if (Number.isFinite(httpDate)) {
              waitMs = Math.min(120_000, Math.max(500, httpDate - Date.now()));
            }
          }
        }
        console.warn(`evaluateCandidate: OpenAI HTTP ${status}, retry ${attempt + 1}/${maxAttempts} in ${waitMs}ms`);
        await sleep(waitMs);
        continue;
      }

      return aiTemporarilyUnavailable(candidateNameHint, `HTTP ${status}`);
    }

    return aiTemporarilyUnavailable(candidateNameHint, "exhausted retries");
  } catch (e) {
    if (isAbortError(e)) {
      return aiTemporarilyUnavailable(candidateNameHint, "timeout");
    }
    console.error("evaluateCandidate", e);
    return aiTemporarilyUnavailable(candidateNameHint, "unexpected");
  }
}
