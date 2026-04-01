/**
 * Extract and normalize skills / keywords from job descriptions for matching.
 * Hybrid: OpenAI JSON when key present, else rule-based dictionary scan.
 */

import type { CompactJobForRerank } from "@/lib/aiMatcher/buildTop10RerankPayload";
import { fetchOpenAiChatCompletions, isAbortError, openAiChatTimeoutMs } from "@/lib/openaiChat";
import { parseCandidateSkillsNormalized } from "@/lib/skillNormalization";

export const TECH_LEXICON = new Set(
  [
    "javascript",
    "typescript",
    "react",
    "next.js",
    "nextjs",
    "node.js",
    "nodejs",
    "express",
    "angular",
    "vue",
    "redux",
    "graphql",
    "rest",
    "api",
    "html",
    "css",
    "tailwind",
    "sass",
    "webpack",
    "vite",
    "java",
    "spring",
    "spring boot",
    "kotlin",
    "python",
    "django",
    "flask",
    "fastapi",
    "pandas",
    "numpy",
    "machine learning",
    "deep learning",
    "tensorflow",
    "pytorch",
    "nlp",
    "sql",
    "postgresql",
    "postgres",
    "mysql",
    "mongodb",
    "redis",
    "elasticsearch",
    "kafka",
    "rabbitmq",
    "aws",
    "azure",
    "gcp",
    "docker",
    "kubernetes",
    "k8s",
    "terraform",
    "ansible",
    "jenkins",
    "ci/cd",
    "git",
    "linux",
    "bash",
    "shell",
    "c#",
    "dotnet",
    ".net",
    "asp.net",
    "golang",
    "rust",
    "c++",
    "swift",
    "ios",
    "android",
    "flutter",
    "react native",
    "microservices",
    "system design",
    "agile",
    "scrum",
    "jira",
    "figma",
    "salesforce",
    "sap",
    "power bi",
    "tableau",
    "looker",
    "databricks",
    "excel",
    "seo",
    "digital marketing",
    "hr",
    "recruitment",
    "talent acquisition",
    "payroll",
    "compliance",
    "blockchain",
    "solidity",
    "ethereum",
    "security",
    "penetration testing",
    "owasp",
  ].map((s) => s.toLowerCase())
);

function normalizeSkillToken(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.js$/i, ".js");
}

/** Candidate skill tokens → canonical keys (shared with match scoring). */
export function parseCandidateSkills(skills: string | null | undefined): Set<string> {
  return parseCandidateSkillsNormalized(skills);
}

function extractMustNiceSections(text: string): { must: string; nice: string } {
  const t = text.replace(/\r/g, "\n");
  const mustMatch = t.match(
    /(?:must[-\s]?have|required|mandatory|essential|key\s+skills?|technical\s+skills?)[:\s]*([\s\S]{0,4000}?)(?=(?:nice[-\s]?to[-\s]?have|preferred|good[-\s]?to[-\s]?have|bonus|$))/i
  );
  const niceMatch = t.match(
    /(?:nice[-\s]?to[-\s]?have|preferred|good[-\s]?to[-\s]?have|bonus|optional)[:\s]*([\s\S]{0,2000}?)$/im
  );
  return {
    must: (mustMatch?.[1] || t).slice(0, 6000),
    nice: (niceMatch?.[1] || "").slice(0, 3000),
  };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Exported for No-AI prefilter / candidate profile derivation (deterministic, no AI). */
export function scanLexicon(haystack: string): Set<string> {
  const lower = haystack.toLowerCase();
  const found = new Set<string>();
  for (const term of TECH_LEXICON) {
    if (term.length < 2) continue;
    if (term.includes(" ") || term.includes(".")) {
      const idx = lower.indexOf(term);
      if (idx === -1) continue;
      const before = idx > 0 ? lower[idx - 1] : " ";
      const after = idx + term.length < lower.length ? lower[idx + term.length] : " ";
      const boundaryOk = !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
      if (boundaryOk) found.add(term);
      continue;
    }
    if (term.length <= 3) {
      const re = new RegExp(`(?<![a-z0-9])${escapeRegExp(term)}(?![a-z0-9])`, "i");
      if (re.test(lower)) found.add(term);
      continue;
    }
    const idx = lower.indexOf(term);
    if (idx === -1) continue;
    const before = idx > 0 ? lower[idx - 1] : " ";
    const after = idx + term.length < lower.length ? lower[idx + term.length] : " ";
    const boundaryOk = !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
    if (boundaryOk) found.add(term);
  }
  return found;
}

export type ExtractedSkillProfile = {
  must_have: string[];
  nice_to_have: string[];
  keywords: string[];
  mode: "AI" | "RULE_BASED";
};

/** Words from job titles that are not hireable "skills" (they inflate must_have and crush scores). */
const TITLE_ROLE_FLUFF = new Set([
  "senior",
  "junior",
  "lead",
  "engineer",
  "developer",
  "manager",
  "specialist",
  "analyst",
  "business",
  "insights",
  "engagement",
  "partner",
  "digital",
  "center",
  "excellence",
  "coe",
  "remote",
  "hybrid",
  "full",
  "time",
  "contract",
  "the",
  "and",
  "for",
]);

/** Single-token junk often leaked from titles or sloppy extraction. */
const MUST_HAVE_JUNK_TOKENS = new Set([
  "business",
  "insights",
  "engagement",
  "partner",
  "digital",
  "excellence",
  "center",
  "strategy",
  "go",
  "the",
  "and",
  "our",
  "all",
  "any",
  "data",
  "role",
  "team",
  "work",
]);

/**
 * Drop title fluff, ambiguous tokens, and overly generic one-word entries from extracted profiles.
 */
export function sanitizeExtractedSkillProfile(p: ExtractedSkillProfile): ExtractedSkillProfile {
  const keepPhrase = (raw: string, allowShortLexicon: boolean): boolean => {
    const t = normalizeSkillToken(raw);
    if (t.length < 2) return false;
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      const w = parts[0];
      if (MUST_HAVE_JUNK_TOKENS.has(w)) return false;
      if (w.length <= 3 && !TECH_LEXICON.has(w)) return false;
      if (allowShortLexicon && TECH_LEXICON.has(w)) return true;
      if (!TECH_LEXICON.has(w) && w.length < 5) return false;
      return true;
    }
    if (parts.every((w) => MUST_HAVE_JUNK_TOKENS.has(w))) return false;
    return true;
  };

  const must = p.must_have.map(normalizeSkillToken).filter((s) => keepPhrase(s, true)).slice(0, 12);
  const nice = p.nice_to_have.map(normalizeSkillToken).filter((s) => keepPhrase(s, true)).slice(0, 14);
  const kwKeep = (s: string) => {
    const t = normalizeSkillToken(s);
    if (t.length < 4) return false;
    if (keepPhrase(t, true)) return true;
    return t.split(/\s+/).length >= 2;
  };
  const keywords = p.keywords.map(normalizeSkillToken).filter(kwKeep).slice(0, 12);

  let mustOut = [...new Set(must)];
  if (mustOut.length === 0 && p.must_have.length > 0) {
    mustOut = p.must_have
      .map(normalizeSkillToken)
      .filter((t) => t.split(/\s+/).length >= 2 || TECH_LEXICON.has(t))
      .filter((t) => !MUST_HAVE_JUNK_TOKENS.has(t) || t.includes(" "))
      .slice(0, 10);
  }

  return {
    must_have: mustOut,
    nice_to_have: [...new Set(nice)],
    keywords: [...new Set(keywords)],
    mode: p.mode,
  };
}

export function extractSkillsRuleBased(title: string, description: string): ExtractedSkillProfile {
  const { must, nice } = extractMustNiceSections(description || title || "");
  const titleWords = (title || "")
    .toLowerCase()
    .split(/[\s,/|]+/)
    .map((w) => w.replace(/[^a-z0-9.+#]/g, ""))
    .filter((w) => w.length > 2 && !TITLE_ROLE_FLUFF.has(w));

  const mustSet = scanLexicon(`${title}\n${must}`);
  const niceSet = scanLexicon(nice);
  for (const w of titleWords) {
    if (w.length > 2) mustSet.add(w);
  }
  niceSet.forEach((s) => mustSet.delete(s));

  const mustArr = Array.from(mustSet).sort();
  const niceArr = Array.from(niceSet).sort();
  const keywords = Array.from(new Set([...titleWords].filter(Boolean))).slice(0, 12);

  if (mustArr.length === 0 && (description || title)) {
    const fallback = scanLexicon(`${title}\n${description}`);
    return sanitizeExtractedSkillProfile({
      must_have: Array.from(fallback).slice(0, 15).sort(),
      nice_to_have: niceArr.slice(0, 8),
      keywords,
      mode: "RULE_BASED",
    });
  }

  return sanitizeExtractedSkillProfile({
    must_have: mustArr.slice(0, 20),
    nice_to_have: niceArr.slice(0, 12),
    keywords,
    mode: "RULE_BASED",
  });
}

async function extractWithOpenAI(title: string, description: string, employmentType: string): Promise<ExtractedSkillProfile | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const prompt = `From this job posting, extract hiring signals for ATS matching. Return strict JSON:
{
  "must_have": string[],
  "nice_to_have": string[],
  "keywords": string[]
}
Rules:
- must_have: ONLY concrete tools, platforms, and methods a recruiter would Ctrl+F on a resume (max 10).
  Examples: sql, python, tableau, databricks, machine learning, campaign analytics.
  NEVER output single generic words alone: business, insights, engagement, partner, digital, go, data, strategy.
  Do NOT duplicate words from the job title unless they name a tool (e.g. Tableau).
  Put stakeholder/account/partnering themes in nice_to_have, not must_have.
- nice_to_have: complementary tools, soft competencies, research tools (max 10).
- keywords: themes (max 8): e.g. marketing analytics, funnel, data storytelling, buyer journey.
Job title: ${title}
Employment: ${employmentType || "N/A"}
Description:
${(description || "").slice(0, 12000)}`;

  let res: Response;
  try {
    res = await fetchOpenAiChatCompletions(
      {
        model: process.env.MATCH_OPENAI_MODEL || "gpt-4o",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You extract structured skills for ATS matching." },
          { role: "user", content: prompt },
        ],
      },
      openAiChatTimeoutMs("jd_extract")
    );
  } catch (e) {
    if (isAbortError(e)) {
      console.error("jdSkillExtraction: OpenAI JD extract timed out (MATCH_OPENAI_JD_TIMEOUT_MS)");
    } else {
      console.error("jdSkillExtraction: OpenAI fetch failed", e);
    }
    return null;
  }
  if (!res.ok) return null;
  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text) return null;
  const parsed = JSON.parse(text) as {
    must_have?: unknown;
    nice_to_have?: unknown;
    keywords?: unknown;
  };
  const must: string[] = Array.isArray(parsed?.must_have)
    ? (parsed.must_have as unknown[]).map((x) => normalizeSkillToken(String(x))).filter((t) => t.length >= 2)
    : [];
  const nice: string[] = Array.isArray(parsed?.nice_to_have)
    ? (parsed.nice_to_have as unknown[]).map((x) => normalizeSkillToken(String(x))).filter((t) => t.length >= 2)
    : [];
  const kw: string[] = Array.isArray(parsed?.keywords)
    ? (parsed.keywords as unknown[]).map((x) => normalizeSkillToken(String(x))).filter((t) => t.length >= 2)
    : [];
  return sanitizeExtractedSkillProfile({
    must_have: [...new Set(must)].slice(0, 15),
    nice_to_have: [...new Set(nice)].slice(0, 10),
    keywords: [...new Set(kw)].slice(0, 10),
    mode: "AI",
  });
}

export async function extractJobSkillProfile(input: {
  title: string;
  description: string;
  employmentType: string;
}): Promise<ExtractedSkillProfile> {
  try {
    const ai = await extractWithOpenAI(input.title, input.description, input.employmentType);
    if (ai && (ai.must_have.length > 0 || ai.nice_to_have.length > 0)) {
      const rule = extractSkillsRuleBased(input.title, input.description);
      const ruleToolMusts = rule.must_have.filter((s) => TECH_LEXICON.has(normalizeSkillToken(s)));
      const mergedMust = [...new Set([...ai.must_have, ...ruleToolMusts])].slice(0, 16);
      const mergedNice = [...new Set([...ai.nice_to_have, ...rule.nice_to_have])].slice(0, 14);
      return sanitizeExtractedSkillProfile({
        must_have: mergedMust,
        nice_to_have: mergedNice,
        keywords: [...new Set([...ai.keywords, ...rule.keywords])].slice(0, 12),
        mode: "AI",
      });
    }
  } catch {
    // fall through
  }
  return extractSkillsRuleBased(input.title, input.description);
}

export function profileToCommaLists(p: ExtractedSkillProfile) {
  return {
    must: p.must_have.join(", "),
    nice: p.nice_to_have.join(", "),
    keywords: p.keywords.join(", "),
  };
}

/** Best-effort min years from careers-style requirement text (e.g. "5+ years"). */
export function parseMinYearsFromExperienceLabel(text: string | null | undefined): number | null {
  if (!text?.trim()) return null;
  const t = text.trim();
  const m = t.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? Math.min(45, Math.round(n * 10) / 10) : null;
  }
  const m2 = t.match(/(\d+(?:\.\d+)?)/);
  if (m2) {
    const n = Number(m2[1]);
    if (n >= 0 && n <= 45) return n;
  }
  return null;
}

/**
 * Compact job payload for hybrid top-10 AI rerank (no full JD body — use jd_summary only).
 */
export function buildCompactAiJobProfile(input: {
  job_id: number;
  title: string;
  description: string | null;
  experience_requirement: string | null;
  must_have_skills: string | null;
  nice_to_have_skills: string | null;
  role_keywords: string | null;
}): CompactJobForRerank {
  const desc = (input.description || "").trim();
  const rule = extractSkillsRuleBased(input.title, input.description || "");
  const mustFromProfile = (input.must_have_skills || "")
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 24);
  const niceFromProfile = (input.nice_to_have_skills || "")
    .split(/[,;\n]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 24);

  const required_skills = mustFromProfile.length > 0 ? mustFromProfile : rule.must_have.slice(0, 20);
  const preferred_skills = niceFromProfile.length > 0 ? niceFromProfile : rule.nice_to_have.slice(0, 16);

  const min_years =
    parseMinYearsFromExperienceLabel(input.experience_requirement) ??
    parseMinYearsFromExperienceLabel(desc.slice(0, 2000));

  const kw = (input.role_keywords || "").trim();
  const domain =
    kw.length > 0
      ? kw.split(/[,;]/)[0]?.trim().slice(0, 80) || null
      : rule.keywords[0]?.slice(0, 80) || null;

  const must_have_conditions: string[] = [];
  if (input.experience_requirement?.trim()) {
    must_have_conditions.push(input.experience_requirement.trim().slice(0, 200));
  }
  if (required_skills.length > 0) {
    must_have_conditions.push(`Core stack: ${required_skills.slice(0, 12).join(", ")}`.slice(0, 400));
  }

  const jd_summary = [
    input.title.trim(),
    desc.slice(0, 3500),
    input.experience_requirement ? `Experience: ${input.experience_requirement}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);

  return {
    job_id: input.job_id,
    job_title: input.title.trim().slice(0, 200),
    required_skills,
    preferred_skills,
    min_years_experience: min_years,
    domain,
    must_have_conditions: must_have_conditions.slice(0, 8),
    jd_summary,
  };
}
