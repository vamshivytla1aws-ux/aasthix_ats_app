/**
 * JD parsing for PostgreSQL prefilter (rule-based only, no AI).
 */
import { extractSkillsRuleBased } from "@/lib/jdSkillExtraction";

export type JdPrefilterSignals = {
  /** Normalized skill tokens for overlap with candidates.normalized_skills */
  jd_skill_tokens: string[];
  /** Minimum years if JD states a requirement (e.g. "5+ years") */
  min_years: number | null;
  /** Title / role keywords from extraction */
  title_keywords: string[];
};

export function extractMinYearsFromJd(text: string | null | undefined): number | null {
  if (!text?.trim()) return null;
  const t = text.slice(0, 24_000);
  const patterns = [
    /(\d+)\s*\+\s*years?/i,
    /(\d+)\s*[-–]\s*\d+\s*years?/i,
    /minimum\s+(?:of\s+)?(\d+)\s*years?/i,
    /at\s+least\s+(\d+)\s*years?/i,
    /(\d+)\+?\s*years?\s+(?:of\s+)?experience/i,
  ];
  let best: number | null = null;
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 40) {
        if (best == null || n < best) best = n;
      }
    }
  }
  return best;
}

export function parseJdPrefilter(title: string, description: string | null): JdPrefilterSignals {
  const profile = extractSkillsRuleBased(title || "", description || "");
  const min_years = extractMinYearsFromJd(description || title);
  const set = new Set<string>();
  for (const s of profile.must_have) set.add(s.toLowerCase());
  for (const s of profile.nice_to_have) set.add(s.toLowerCase());
  for (const s of profile.keywords) set.add(s.toLowerCase());
  const jd_skill_tokens = [...set].filter(Boolean).sort();
  const title_keywords = (title || "")
    .toLowerCase()
    .split(/[\s,/|]+/)
    .map((w) => w.replace(/[^a-z0-9.+#]/g, ""))
    .filter((w) => w.length > 2)
    .slice(0, 24);
  return { jd_skill_tokens, min_years, title_keywords };
}
