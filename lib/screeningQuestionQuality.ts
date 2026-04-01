/**
 * Recruiter-safe post-processing for AI-generated screening questions.
 * Exported for unit/integration tests.
 */

export type ScreeningQuestionInput = {
  question_type: "technical" | "scenario";
  question_text: string;
  sort_order: number;
  difficulty?: "easy" | "standard" | "stretch";
};

const BLACKLIST_SUBSTRINGS = [
  "as an ai",
  "as a language model",
  "chatgpt",
  "openai",
  "i cannot",
  "i'm unable",
  "homework",
  "exam answer",
  "google form",
];

const PROFANITY = ["damn", "hell", "shit", "fuck"];

function normalizeForDedup(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s?.,'-]/gi, "")
    .trim();
}

function isBlacklisted(text: string) {
  const t = text.toLowerCase();
  if (t.length < 25) return true;
  return BLACKLIST_SUBSTRINGS.some((b) => t.includes(b));
}

function hasBadTone(text: string) {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (!letters.length) return true;
  const upper = (text.match(/[A-Z]/g) || []).length;
  if (upper / letters.length > 0.45) return true;
  const low = text.toLowerCase();
  return PROFANITY.some((w) => low.includes(w));
}

/** Interleave technical and scenario for a balanced assessment flow */
function interleaveTypes(items: ScreeningQuestionInput[]) {
  const tech = items.filter((q) => q.question_type === "technical");
  const scen = items.filter((q) => q.question_type === "scenario");
  const out: ScreeningQuestionInput[] = [];
  const maxLen = Math.max(tech.length, scen.length);
  for (let i = 0; i < maxLen; i++) {
    if (tech[i]) out.push(tech[i]);
    if (scen[i]) out.push(scen[i]);
  }
  return out;
}

function assignDifficultyRoundRobin(items: ScreeningQuestionInput[]): ScreeningQuestionInput[] {
  const order: Array<"easy" | "standard" | "stretch"> = ["easy", "standard", "stretch"];
  return items.map((q, i) => ({
    ...q,
    difficulty: order[i % order.length],
  }));
}

/**
 * Deduplicate, drop low-quality, interleave types, spread difficulty labels.
 */
export function applyQuestionQualityControls(
  questions: ScreeningQuestionInput[],
  opts?: { minCount?: number; maxCount?: number; minTechnical?: number; minScenario?: number }
): ScreeningQuestionInput[] {
  const minCount = Math.max(5, opts?.minCount ?? 5);
  const maxCount = Math.min(10, Math.max(minCount, opts?.maxCount ?? 8));
  const minTechnical = opts?.minTechnical ?? 2;
  const minScenario = opts?.minScenario ?? 2;

  const seen = new Set<string>();
  const cleaned: ScreeningQuestionInput[] = [];
  for (const q of questions) {
    const text = String(q.question_text || "").trim();
    if (!text) continue;
    if (isBlacklisted(text) || hasBadTone(text)) continue;
    const key = normalizeForDedup(text);
    if (key.length < 20) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const question_type = q.question_type === "scenario" ? "scenario" : "technical";
    cleaned.push({
      question_type,
      question_text: text,
      sort_order: cleaned.length + 1,
    });
  }

  const tech = cleaned.filter((q) => q.question_type === "technical");
  const scen = cleaned.filter((q) => q.question_type === "scenario");
  const prioritized: ScreeningQuestionInput[] = [
    ...tech.slice(0, minTechnical),
    ...scen.slice(0, minScenario),
    ...tech.slice(minTechnical),
    ...scen.slice(minScenario),
  ];

  const dedup2: ScreeningQuestionInput[] = [];
  const seen2 = new Set<string>();
  for (const q of prioritized) {
    const k = normalizeForDedup(q.question_text);
    if (seen2.has(k)) continue;
    seen2.add(k);
    dedup2.push(q);
  }

  const interleaved = interleaveTypes(dedup2);
  const withDiff = assignDifficultyRoundRobin(interleaved);
  const sliced = withDiff.slice(0, maxCount).map((q, idx) => ({ ...q, sort_order: idx + 1 }));

  if (sliced.length < minCount) {
    return sliced;
  }
  return sliced;
}
