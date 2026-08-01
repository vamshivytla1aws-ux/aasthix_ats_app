/**
 * Stage-2 batch: richer JSON (summary, strengths, gaps, decision) for top candidates only.
 * Max 5 per call (same as BATCH_SIZE).
 */
import { fetchOpenAiChatCompletions, isAbortError } from "@/lib/openaiChat";
import { aiMatchingConfig } from "@/lib/config/aiMatching";
import type { BatchCandidateIn } from "@/lib/aiMatcher/batchEvaluate";

function batchModel(): string {
  return process.env.MATCH_NARRATIVE_MODEL || process.env.MATCH_BATCH_OPENAI_MODEL || process.env.RESUME_MATCH_MODEL || process.env.MATCH_OPENAI_MODEL || "gpt-5.6-luna";
}

const JD_MAX = 1_000;
const RESUME_MAX = 1_200;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 12) : [];
}

export type NarrativeBatchRow = {
  id: string;
  match_score: number;
  decision: string;
  recruiter_summary: string;
  decision_reason: string;
  matched_skills: string[];
  missing_skills: string[];
  strengths: string[];
  gaps: string[];
};

export async function evaluateBatchNarrative(jdFull: string, candidates: BatchCandidateIn[]): Promise<NarrativeBatchRow[]> {
  if (candidates.length === 0) return [];
  if (candidates.length > 5) throw new Error("evaluateBatchNarrative: max 5 per call");

  const jdTrim = jdFull.slice(0, JD_MAX);
  const blocks = candidates.map((c) => {
    const snippet = String(c.resumeText || "").slice(0, RESUME_MAX);
    const nm = c.name ? ` name: ${c.name}` : "";
    return `---\nCANDIDATE_ID: ${c.id}${nm}\nRESUME:\n${snippet}\n`;
  });

  const userPrompt = `JOB:\n${jdTrim}\n\nCANDIDATES:\n${blocks.join("\n")}\n\nReturn JSON only:\n{"results":[{"id":"<CANDIDATE_ID>","match_score":0-100,"decision":"Proceed to Interview"|"Hold"|"Reject","recruiter_summary":"one paragraph","decision_reason":"2-4 sentences","matched_skills":["..."],"missing_skills":["..."],"strengths":["..."],"gaps":["..."]}]}`;

  const body = {
    model: batchModel(),
    temperature: 0.2,
    response_format: { type: "json_object" as const },
    messages: [
      {
        role: "system" as const,
        content:
          "You are a senior recruiter. For each candidate, give structured hiring insight using semantic evidence. Treat explicit AI/LLM, agent, LangGraph, RAG, and multi-model gateway work as real experience evidence, not generic backend noise. JSON only, no markdown.",
      },
      { role: "user" as const, content: userPrompt },
    ],
  };

  const fallback = (): NarrativeBatchRow[] =>
    candidates.map((c) => ({
      id: String(c.id),
      match_score: 60,
      decision: "Hold",
      recruiter_summary: "—",
      decision_reason: "",
      matched_skills: [],
      missing_skills: [],
      strengths: [],
      gaps: [],
    }));

  const parse = async (): Promise<NarrativeBatchRow[]> => {
    const res = await fetchOpenAiChatCompletions(body, aiMatchingConfig.timeoutMs);
    if (!res.ok) throw new Error(`narrative HTTP ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json?.choices?.[0]?.message?.content;
    if (!text) throw new Error("empty narrative");
    const parsed = JSON.parse(text) as { results?: unknown[] };
    const arr = Array.isArray(parsed.results) ? parsed.results : [];
    const out: NarrativeBatchRow[] = [];
    for (const raw of arr) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const id = String(o.id ?? "").trim();
      if (!id) continue;
      out.push({
        id,
        match_score: Math.max(0, Math.min(100, Math.round(Number(o.match_score) || 0))),
        decision: String(o.decision ?? "Hold"),
        recruiter_summary: String(o.recruiter_summary || o.summary || "—").slice(0, 2_000),
        decision_reason: String(o.decision_reason || "").slice(0, 2_000),
        matched_skills: strArr(o.matched_skills),
        missing_skills: strArr(o.missing_skills),
        strengths: strArr(o.strengths),
        gaps: strArr(o.gaps),
      });
    }
    return out;
  };

  try {
    return await parse();
  } catch (e) {
    if (isAbortError(e)) return fallback();
    await sleep(400);
    try {
      return await parse();
    } catch {
      return fallback();
    }
  }
}

export type { BatchCandidateIn };
