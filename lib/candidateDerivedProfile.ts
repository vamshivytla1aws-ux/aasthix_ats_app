/**
 * Deterministic candidate profile fields for PostgreSQL prefiltering (No-AI matching).
 * Does not call OpenAI or embeddings.
 */
import type { CompactCandidateForRerank } from "@/lib/aiMatcher/buildTop10RerankPayload";
import type { PythonMatchRow } from "@/lib/noAiMatch/pythonMatcherClient";
import { parseCandidateSkillsNormalized } from "@/lib/skillNormalization";
import { scanLexicon } from "@/lib/jdSkillExtraction";

const DOMAIN_MARKERS: { tag: string; re: RegExp }[] = [
  { tag: "fintech", re: /\b(fintech|banking|payments?|trading)\b/i },
  { tag: "healthcare", re: /\b(healthcare|health\s*tech|medical|pharma|hipaa)\b/i },
  { tag: "edtech", re: /\b(edtech|e-?learning|lms|education)\b/i },
  { tag: "ecommerce", re: /\b(e-?commerce|ecommerce|retail\s*tech|shopify)\b/i },
  { tag: "saas", re: /\b(saas|b2b\s*software|subscription)\b/i },
];

/** Estimate total years of experience from resume text (deterministic heuristics). */
export function estimateYearsFromResumeText(text: string | null | undefined): number | null {
  if (!text?.trim()) return null;
  const t = text.slice(0, 50_000);
  const ranges: number[] = [];

  const reRange =
    /(\d{4})\s*[-–—]\s*(?:(\d{4})|present|current|now)/gi;
  let m: RegExpExecArray | null;
  while ((m = reRange.exec(t)) !== null) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : new Date().getFullYear();
    if (a >= 1990 && b >= a && b - a <= 50) ranges.push(b - a);
  }

  const reYrs = /(\d+(?:\.\d+)?)\s*\+?\s*years?/gi;
  while ((m = reYrs.exec(t)) !== null) {
    const y = Number(m[1]);
    if (y >= 0 && y <= 45) ranges.push(y);
  }

  if (ranges.length === 0) {
    const m2 = t.match(/\b(\d+)\s*\+?\s*yrs?\b/i);
    if (m2) {
      const y = Number(m2[1]);
      if (y >= 0 && y <= 45) return Math.round(y * 10) / 10;
    }
    return null;
  }

  const max = Math.max(...ranges);
  return Math.min(45, Math.round(max * 10) / 10);
}

export function extractDomainTags(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  const out = new Set<string>();
  for (const { tag, re } of DOMAIN_MARKERS) {
    if (re.test(text)) out.add(tag);
  }
  return [...out].sort();
}

/** Very light "title" signal for prefilter: first non-empty line of summary or resume head. */
export function inferNormalizedTitle(skills: string | null, resumeText: string | null, experienceSummary: string | null): string | null {
  const fromSummary = experienceSummary?.trim().split("\n")[0]?.trim().slice(0, 120);
  if (fromSummary && fromSummary.length > 3) return fromSummary.toLowerCase();
  const head = resumeText?.trim().split("\n").find((l) => l.trim().length > 3);
  if (head) return head.trim().slice(0, 120).toLowerCase();
  const s = skills?.trim();
  if (s) return s.split(",")[0]?.trim().toLowerCase().slice(0, 120) || null;
  return null;
}

export function normalizedSkillsFromCandidate(
  skills: string | null | undefined,
  resumeText: string | null | undefined,
  experienceSummary: string | null | undefined
): string[] {
  const fromFields = parseCandidateSkillsNormalized(skills);
  const fromResumeComma = parseCandidateSkillsNormalized(resumeText);
  const fromExp = parseCandidateSkillsNormalized(experienceSummary);
  const fromLex = resumeText?.trim() ? scanLexicon(resumeText) : new Set<string>();
  const merged = new Set<string>([
    ...fromFields,
    ...fromResumeComma,
    ...fromExp,
    ...fromLex,
  ]);
  return [...merged].sort();
}

export type CandidateDerivedProfile = {
  normalized_skills: string[];
  normalized_title: string | null;
  years_experience: number | null;
  domain_tags: string[];
  resume_length: number;
};

/**
 * Compact, AI-safe candidate summary for hybrid top-10 rerank (rule signals come from Python row).
 */
export function buildCompactAiCandidateProfile(
  row: {
    id: number;
    skills?: string | null;
    resume_text?: string | null;
    experience_summary?: string | null;
    location?: string | null;
    normalized_skills?: string[] | null;
    years_experience?: number | string | null;
    domain_tags?: string[] | null;
    normalized_title?: string | null;
  },
  py: PythonMatchRow,
  noAiRank: number
): CompactCandidateForRerank {
  const skills_normalized =
    Array.isArray(row.normalized_skills) && row.normalized_skills.length > 0
      ? [...row.normalized_skills]
      : normalizedSkillsFromCandidate(row.skills, row.resume_text, row.experience_summary);

  let years: number | null = null;
  if (row.years_experience != null && row.years_experience !== "") {
    const n = Number(row.years_experience);
    years = Number.isFinite(n) ? Math.min(45, Math.round(n * 10) / 10) : null;
  }
  if (years == null) {
    years = estimateYearsFromResumeText(
      [row.experience_summary, row.resume_text].filter(Boolean).join("\n") || null
    );
  }

  const titleLine = inferNormalizedTitle(
    row.skills ?? null,
    row.resume_text ?? null,
    row.experience_summary ?? null
  );
  const recent_titles = [row.normalized_title?.trim() || titleLine || ""].filter(Boolean).slice(0, 4);

  const domain =
    Array.isArray(row.domain_tags) && row.domain_tags.length > 0
      ? String(row.domain_tags[0]).slice(0, 80)
      : null;

  return {
    candidate_id: String(row.id),
    recent_titles: recent_titles.map((t) => t.slice(0, 120)),
    years_experience: years,
    skills_normalized: skills_normalized.map((s) => s.slice(0, 64)).slice(0, 40),
    matched_required_skills: py.matched_required_skills ?? [],
    missing_required_skills: py.missing_required_skills ?? [],
    recent_experience_summary: (row.experience_summary || "").trim().slice(0, 500),
    location: row.location?.trim().slice(0, 120) ?? null,
    work_authorization: null,
    rule_based: {
      match_score_no_ai: py.match_score,
      decision_no_ai: py.decision,
      no_ai_rank: noAiRank,
      exact_required_coverage: Number(py.exact_required_coverage ?? 0),
      title_match: Number(py.title_match ?? 0),
      domain_match: Boolean(py.domain_match ?? false),
      qualification_gate_failed: Boolean(py.qualification_gate_failed ?? false),
    },
  };
}

export function computeCandidateDerivedProfile(row: {
  skills?: string | null;
  resume_text?: string | null;
  experience_summary?: string | null;
}): CandidateDerivedProfile {
  const resumeText = row.resume_text ?? "";
  const skills = row.skills ?? null;
  const exp = row.experience_summary ?? null;
  const normalized_skills = normalizedSkillsFromCandidate(skills, resumeText, exp);
  const years_experience = estimateYearsFromResumeText(
    [exp, resumeText].filter(Boolean).join("\n") || null
  );
  const domain_tags = extractDomainTags(`${resumeText}\n${exp || ""}`);
  const normalized_title = inferNormalizedTitle(skills, resumeText, exp);
  const resume_length = resumeText.trim().length;

  return {
    normalized_skills,
    normalized_title,
    years_experience,
    domain_tags,
    resume_length,
  };
}
