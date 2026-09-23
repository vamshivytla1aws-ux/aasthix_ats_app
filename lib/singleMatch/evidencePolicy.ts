import { z } from "zod";

export const EVIDENCE_POLICY_VERSION = "evidence-v3.1";
export const EVIDENCE_PROMPT_VERSION = "requirements-v1";
const category = z.enum(["mandatory", "responsibilities", "experience", "preferences", "logistics"]);
export const requirementSchema = z.object({
  id: z.string().min(1).max(80), label: z.string().min(1).max(500), category,
  jd_quote: z.string().min(3).max(2000), critical: z.boolean(), production_required: z.boolean(),
  alternatives: z.array(z.string().min(1).max(200)).max(12),
  minimum_months: z.number().int().min(0).max(600).nullable(),
});
export const requirementsSchema = z.object({
  complete: z.boolean(), requirements: z.array(requirementSchema).min(1).max(60),
});
export const findingSchema = z.object({
  requirement_id: z.string(),
  depth: z.enum(["production", "supported", "partial", "claim", "training", "absent", "contradiction", "explicit_mismatch"]),
  quotes: z.array(z.string().min(3).max(2000)).max(6),
  explanation: z.string().min(1).max(1500),
  periods: z.array(z.object({ start: z.string(), end: z.string(), quote: z.string().min(3).max(2000) })).max(30),
  question: z.string().max(600),
});
export const findingsSchema = z.object({ complete: z.boolean(), findings: z.array(findingSchema).max(60) });
export type Requirement = z.infer<typeof requirementSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type EvidenceReference = { quote: string; start: number; end: number };
export type AuditedRequirement = Requirement & Finding & {
  evidence: EvidenceReference[]; credit: number; relevant_months: number | null; audit_issues: string[];
};

// Exact excerpts only: no fuzzy quote matching can turn an invented citation into evidence.
export function locateEvidence(text: string, quote: string): EvidenceReference | null {
  const start = text.indexOf(quote);
  return start < 0 ? null : { quote, start, end: start + quote.length };
}

function monthIndex(value: string, now: Date): number | null {
  if (value === "present") return now.getUTCFullYear() * 12 + now.getUTCMonth();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  if (year < 1950 || year > now.getUTCFullYear()) return null;
  return year * 12 + month - 1;
}

/** Half-open month intervals: concurrent jobs do not increase elapsed experience. */
export function mergedExperienceMonths(periods: Finding["periods"], now = new Date()): number | null {
  const current = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const intervals: Array<[number, number]> = [];
  for (const p of periods) {
    const start = monthIndex(p.start, now), end = monthIndex(p.end, now);
    if (start == null || end == null || end < start || end > current) return null;
    intervals.push([start, end]);
  }
  if (!intervals.length) return null;
  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0, [start, end] = intervals[0];
  for (const next of intervals.slice(1)) {
    if (next[0] <= end) end = Math.max(end, next[1]);
    else { total += end - start; [start, end] = next; }
  }
  return total + end - start;
}

const creditByDepth: Record<Finding["depth"], number> = {
  production: 1, supported: 1, partial: 0.5, claim: 0.25, training: 0.25,
  absent: 0, contradiction: 0, explicit_mismatch: 0,
};

function dateIsCited(value: string, quote: string): boolean {
  if (value === "present") return /\b(present|current|ongoing|now)\b/i.test(quote);
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const [year, month] = value.split("-");
  const names = ["jan(?:uary)?", "feb(?:ruary)?", "mar(?:ch)?", "apr(?:il)?", "may", "jun(?:e)?", "jul(?:y)?", "aug(?:ust)?", "sep(?:t(?:ember)?)?", "oct(?:ober)?", "nov(?:ember)?", "dec(?:ember)?"];
  const name = names[Number(month) - 1];
  if (!name) return false;
  return new RegExp(`\\b(?:${year}[-/]${month}|0?${Number(month)}[/-]${year}|${name}[\\s,./-]+${year}|${year}[\\s,./-]+${name})\\b`, "i").test(quote);
}

export function auditRequirements(requirements: Requirement[], findings: Finding[], resume: string): AuditedRequirement[] {
  return requirements.map(req => {
    const matches = findings.filter(f => f.requirement_id === req.id);
    const finding = matches[0] || { requirement_id: req.id, depth: "absent" as const, quotes: [], explanation: "Requirement was not evaluated.", periods: [], question: `Please clarify ${req.label}.` };
    const issues: string[] = [];
    if (matches.length !== 1) issues.push("Requirement coverage is missing or duplicated.");
    const evidence = finding.quotes.map(q => locateEvidence(resume, q)).filter((e): e is EvidenceReference => e !== null);
    if (evidence.length !== finding.quotes.length) issues.push("A cited excerpt is not in the resume.");
    if (finding.depth !== "absent" && !evidence.length) issues.push("The evidence assessment has no verifiable citation.");
    if (finding.depth === "absent" && evidence.length) issues.push("Missing-versus-matched evidence conflict.");
    const periods = finding.periods.filter(p => locateEvidence(resume, p.quote) && dateIsCited(p.start, p.quote) && dateIsCited(p.end, p.quote));
    if (periods.length !== finding.periods.length) issues.push("An experience interval has no valid source citation.");
    const months = mergedExperienceMonths(periods);
    if (periods.length && months == null) issues.push("Experience dates are invalid or ambiguous.");
    let credit = creditByDepth[finding.depth];
    if (req.production_required && finding.depth === "supported") credit = 0.5;
    if (req.minimum_months != null && req.minimum_months > 0) {
      if (months == null) { credit = Math.min(credit, 0.25); issues.push("Relevant dated experience needs confirmation."); }
      else credit = Math.min(credit, months / req.minimum_months);
    }
    if (issues.length) credit = 0;
    return { ...req, ...finding, evidence, credit, relevant_months: months, audit_issues: issues };
  });
}

export function decideEvidence(rows: AuditedRequirement[], unresolvedReview = false) {
  const weights = { mandatory: 50, responsibilities: 25, experience: 20, preferences: 5 };
  const active = Object.entries(weights).filter(([key]) => rows.some(r => r.category === key));
  const totalWeight = active.reduce((sum, [, weight]) => sum + weight, 0);
  const breakdown = active.map(([key, weight]) => {
    const group = rows.filter(r => r.category === key);
    const max = weight * 100 / totalWeight;
    return { category: key, max, awarded: max * group.reduce((sum, r) => sum + r.credit, 0) / group.length };
  });
  let score = Math.round(breakdown.reduce((sum, b) => sum + b.awarded, 0));
  const critical = rows.filter(r => r.critical && r.category !== "preferences" && r.category !== "logistics");
  const unknown = critical.filter(r => r.credit < 1 || r.audit_issues.length || r.depth === "contradiction");
  const caps: Array<{ code: string; limit: number; reason: string }> = [];
  for (const row of critical.filter(r => r.production_required && r.depth !== "production")) {
    const limit = ["training", "claim"].includes(row.depth) ? 49 : row.depth === "absent" ? 39 : 59;
    caps.push({ code: `critical:${row.id}`, limit, reason: `${row.label}: required production evidence is not demonstrated in this resume.` });
    score = Math.min(score, limit);
  }
  const disputed = unresolvedReview || rows.some(r => r.audit_issues.length || r.depth === "contradiction");
  const verifiedMismatch = critical.some(r => r.depth === "explicit_mismatch" && r.evidence.length && !r.audit_issues.length);
  const decision = disputed ? "Clarification required"
    : verifiedMismatch || score < 50 ? "Do not shortlist on current evidence"
    : score >= 75 && !unknown.length ? "Send to interview" : "Clarification required";
  return { score: totalWeight ? score : null, decision: totalWeight ? decision : "Clarification required", caps, breakdown, unknown, disputed };
}
