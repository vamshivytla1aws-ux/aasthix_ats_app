import { extractSkillsRuleBased, scanLexicon } from "@/lib/jdSkillExtraction";
import { parseCandidateSkillsNormalized } from "@/lib/skillNormalization";

export type LocalMatchRow = {
  id: string;
  match_score: number;
  hire_probability: number;
  decision: string;
  matched_required_skills: string[];
  missing_required_skills: string[];
  exact_required_coverage: number;
  title_match: number;
  domain_match: boolean;
  qualification_gate_failed: boolean;
};

export type LocalMatchResponse = {
  top_10: LocalMatchRow[];
  all_results: LocalMatchRow[];
  meta: { processed_count: number; latency_ms: number; source: "local" };
};

function normalizeText(text: string | null | undefined): string {
  return String(text || "").toLowerCase();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function listFromRoleKeywords(jd: string): string[] {
  const extracted = extractSkillsRuleBased("", jd);
  const lex = scanLexicon(jd);
  return uniqueSorted([...extracted.must_have, ...Array.from(lex)]);
}

function buildCandidateSkillSet(resume: string): Set<string> {
  const normalized = parseCandidateSkillsNormalized(resume);
  const lex = scanLexicon(resume);
  return new Set<string>([...normalized, ...Array.from(lex)]);
}

function titleSignal(jdText: string, resumeText: string): number {
  const jd = normalizeText(jdText);
  const resume = normalizeText(resumeText);
  if (!jd || !resume) return 0;
  if (resume.includes("power bi developer") && jd.includes("power bi")) return 1;
  const titleWords = jd
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 8);
  if (titleWords.length === 0) return 0;
  let hit = 0;
  for (const w of titleWords) {
    if (resume.includes(w)) hit += 1;
  }
  return Math.max(0, Math.min(1, hit / Math.max(1, titleWords.length)));
}

function domainSignal(jdText: string, resumeText: string): boolean {
  const jd = normalizeText(jdText);
  const resume = normalizeText(resumeText);
  const domainTerms = ["finance", "banking", "healthcare", "retail", "edtech", "saas", "insurance"];
  for (const term of domainTerms) {
    if (jd.includes(term) && resume.includes(term)) return true;
  }
  return false;
}

function computeDecision(score: number, coverage: number, qualificationGateFailed: boolean): string {
  if (qualificationGateFailed) return "Reject";
  if (score >= 75 && coverage >= 0.6) return "Proceed";
  if (score >= 50) return "Hold";
  return "Reject";
}

function scoreOne(jd: string, candidate: { id: string; resume: string }, requiredSkills: string[]): LocalMatchRow {
  const resume = candidate.resume || "";
  const skillSet = buildCandidateSkillSet(resume);
  const matched = requiredSkills.filter((skill) => skillSet.has(skill));
  const missing = requiredSkills.filter((skill) => !skillSet.has(skill));
  const coverage = requiredSkills.length > 0 ? matched.length / requiredSkills.length : 0.5;
  const tMatch = titleSignal(jd, resume);
  const dMatch = domainSignal(jd, resume);
  const qualificationGateFailed = requiredSkills.length >= 3 && matched.length === 0;

  const base = coverage * 70 + tMatch * 20 + (dMatch ? 10 : 0);
  const score = Math.max(0, Math.min(100, Math.round(base)));
  const hire = Math.max(0, Math.min(100, Math.round(score * 0.9 + coverage * 10)));

  return {
    id: String(candidate.id),
    match_score: score,
    hire_probability: hire,
    decision: computeDecision(score, coverage, qualificationGateFailed),
    matched_required_skills: matched,
    missing_required_skills: missing,
    exact_required_coverage: Number((coverage * 100).toFixed(2)),
    title_match: Number((tMatch * 100).toFixed(2)),
    domain_match: dMatch,
    qualification_gate_failed: qualificationGateFailed,
  };
}

export function validateLocalResults(rows: LocalMatchRow[]): Map<string, LocalMatchRow> {
  const out = new Map<string, LocalMatchRow>();
  for (const row of rows) {
    if (!row?.id) continue;
    out.set(String(row.id), {
      ...row,
      match_score: Math.max(0, Math.min(100, Number(row.match_score) || 0)),
      hire_probability: Math.max(0, Math.min(100, Number(row.hire_probability) || 0)),
      matched_required_skills: uniqueSorted((row.matched_required_skills || []).map((s) => String(s).toLowerCase())),
      missing_required_skills: uniqueSorted((row.missing_required_skills || []).map((s) => String(s).toLowerCase())),
    });
  }
  return out;
}

export async function runLocalNoAiMatcher(payload: {
  jd: string;
  candidates: { id: string; resume: string }[];
}): Promise<LocalMatchResponse> {
  const started = Date.now();
  const requiredSkills = listFromRoleKeywords(payload.jd).slice(0, 24);
  const all = payload.candidates.map((candidate) => scoreOne(payload.jd, candidate, requiredSkills));
  const sorted = [...all].sort((a, b) => b.match_score - a.match_score || a.id.localeCompare(b.id));
  const latency = Date.now() - started;
  return {
    top_10: sorted.slice(0, 10),
    all_results: sorted,
    meta: {
      processed_count: payload.candidates.length,
      latency_ms: latency,
      source: "local",
    },
  };
}
