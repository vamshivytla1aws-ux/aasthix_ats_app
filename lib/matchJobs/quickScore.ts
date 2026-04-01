/**
 * Fast pre-filter (no OpenAI): keyword overlap, domain terms, rough experience signal.
 * Used to pick top N candidates for expensive batch AI evaluation.
 */

export type QuickScoreCandidate = {
  skills: string | null;
  experience_summary: string | null;
  resume_text: string | null;
  skillset: string[] | null;
  full_name: string;
  location?: string | null;
};

const DOMAIN_TERMS = [
  "sql",
  "python",
  "tableau",
  "power bi",
  "powerbi",
  "excel",
  "analytics",
  "marketing",
  "insights",
  "stakeholder",
  "campaign",
  "funnel",
  "attribution",
  "looker",
  "snowflake",
  "r",
  "bi",
  "data",
  "visualization",
  "kpi",
];

function norm(s: string): string {
  return s.toLowerCase();
}

function tokens(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of norm(s).split(/[^a-z0-9+#.]+/)) {
    if (w.length >= 2) out.add(w);
  }
  return out;
}

/** Rough years of experience from free text (fast heuristic). */
function estimateYears(text: string): number {
  const t = text.toLowerCase();
  const m = t.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?|y\.?o\.?e\.?)/);
  if (m) return Math.min(20, Math.max(0, parseFloat(m[1]!)));
  const range = t.match(/\b(20\d{2})\s*[-–]\s*(20\d{2}|present|now|current)\b/i);
  if (range) {
    const a = parseInt(range[1]!, 10);
    const end = /present|now|current/i.test(range[2]!) ? new Date().getFullYear() : parseInt(range[2]!, 10);
    if (Number.isFinite(a) && Number.isFinite(end)) return Math.min(20, Math.max(0, (end - a) / 2));
  }
  if (/\b(senior|lead|principal|manager|director|head)\b/i.test(t)) return 7;
  if (/\b(mid|intermediate)\b/i.test(t)) return 4;
  if (/\b(junior|jr|graduate|intern)\b/i.test(t)) return 1;
  return 2;
}

/**
 * Returns 0–100. Cheap: uses JD + candidate fields only (no file extraction).
 */
export function quickScore(jd: string, c: QuickScoreCandidate): number {
  const jdN = norm(jd);
  const blob = [
    c.skills,
    c.experience_summary,
    c.resume_text ? c.resume_text.slice(0, 2500) : "",
    Array.isArray(c.skillset) ? c.skillset.join(" ") : "",
    c.full_name,
    c.location || "",
  ]
    .filter(Boolean)
    .join(" ");
  const blobN = norm(blob);

  const jdTok = tokens(jd);
  const candTok = tokens(blob);
  let overlap = 0;
  for (const t of jdTok) {
    if (t.length < 3) continue;
    if (candTok.has(t)) overlap += 1;
  }
  const denom = Math.max(10, jdTok.size);
  const keywordPart = Math.min(42, (overlap / denom) * 42);

  let domainPart = 0;
  for (const term of DOMAIN_TERMS) {
    if (jdN.includes(term) && blobN.includes(term)) domainPart += 2.2;
  }
  domainPart = Math.min(28, domainPart);

  const yrs = estimateYears(blob + " " + (c.experience_summary || ""));
  const expPart = Math.min(22, 6 + yrs * 1.8);

  const locationHint =
    c.location && jdN.length > 20 && (jdN.includes("remote") === blobN.includes("remote") || blobN.includes("remote"))
      ? 4
      : 0;

  let score = 8 + keywordPart + domainPart + expPart + locationHint;
  return Math.max(0, Math.min(100, Math.round(score)));
}
