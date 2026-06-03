/**
 * Single OpenAI call per batch (max 5 candidates). No per-candidate API calls.
 * JD trimmed to 1000 chars, each resume to 800 chars. Max 1 retry on failure.
 */
import { fetchOpenAiChatCompletions, isAbortError } from "@/lib/openaiChat";
import { matchCacheKey } from "@/lib/aiMatcher/matchCache";
import { getRedisJson, setRedisJson } from "@/lib/services/cacheService";
import { aiMatchingConfig } from "@/lib/config/aiMatching";
import type { AiEvaluationResult } from "@/lib/aiMatcher/evaluateCandidate";

const JD_MAX = 1000;
const RESUME_MAX = 800;

/** Default: full GPT-4o for matching quality. Override with MATCH_BATCH_OPENAI_MODEL only if needed. */
function batchModel(): string {
  return process.env.MATCH_BATCH_OPENAI_MODEL || "gpt-4o";
}

export type BatchCandidateIn = {
  id: number | string;
  resumeText: string;
  name?: string;
};

export type BatchCandidateOut = {
  id: string;
  match_score: number;
  decision: string;
  summary?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function clampScore(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 60;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function fallbackForAll(inputs: BatchCandidateIn[]): BatchCandidateOut[] {
  return inputs.map((c) => ({
    id: String(c.id),
    match_score: 60,
    decision: "Hold",
  }));
}

function redisKeyForCandidate(jd: string, resumeFull: string): string {
  return `ai:match:${matchCacheKey(jd, resumeFull)}`;
}

/**
 * Try per-candidate Redis cache (full JD + full resume hash). Skips API for cached rows.
 */
async function hydrateFromCache(
  jdFull: string,
  inputs: BatchCandidateIn[]
): Promise<{ cached: Map<string, AiEvaluationResult>; uncached: BatchCandidateIn[] }> {
  const cached = new Map<string, AiEvaluationResult>();
  const uncached: BatchCandidateIn[] = [];
  for (const c of inputs) {
    const key = redisKeyForCandidate(jdFull, c.resumeText);
    const hit = await getRedisJson<AiEvaluationResult>(key);
    if (hit && hit.summary !== "AI temporarily unavailable") {
      cached.set(String(c.id), hit);
    } else {
      uncached.push(c);
    }
  }
  return { cached, uncached };
}

function batchOutToCandidateOut(ev: AiEvaluationResult, id: string): BatchCandidateOut {
  return {
    id,
    match_score: ev.match_score,
    decision: String(ev.decision || "Hold"),
    summary: ev.summary,
  };
}

async function callOpenAiBatch(jdTrim: string, inputs: BatchCandidateIn[]): Promise<BatchCandidateOut[]> {
  if (inputs.length === 0) return [];

  const blocks = inputs.map((c, i) => {
    const snippet = String(c.resumeText || "").slice(0, RESUME_MAX);
    const nm = c.name ? ` name: ${c.name}` : "";
    return `---\nCANDIDATE_ID: ${c.id}${nm}\nRESUME_SNIPPET:\n${snippet}\n`;
  });

  const userPrompt = `JOB (evaluate fit against this JD):\n${jdTrim}\n\nCANDIDATES (score each independently):\n${blocks.join("\n")}\n\nReturn JSON only with shape:\n{"results":[{"id":"<same as CANDIDATE_ID>","match_score":0-100,"decision":"Proceed to Interview"|"Hold"|"Reject","summary":"one line"}]}`;

  const body = {
    model: batchModel(),
    temperature: 0.15,
    response_format: { type: "json_object" as const },
    messages: [
      {
        role: "system" as const,
        content:
          "You are a recruiter. Score each candidate 0-100 for JD fit using semantic evidence, especially explicit AI/LLM, agent, LangGraph, RAG, and multi-model gateway work. Treat proven LLM experience as positive experience evidence, not generic backend noise. Output valid JSON only. No markdown.",
      },
      { role: "user" as const, content: userPrompt },
    ],
  };

  const tryOnce = async (): Promise<BatchCandidateOut[]> => {
    const res = await fetchOpenAiChatCompletions(body, aiMatchingConfig.timeoutMs);
    if (!res.ok) {
      throw new Error(`OpenAI HTTP ${res.status}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json?.choices?.[0]?.message?.content;
    if (!text) throw new Error("empty response");
    let parsed: { results?: unknown };
    try {
      parsed = JSON.parse(text) as { results?: unknown };
    } catch {
      throw new Error("json parse");
    }
    const arr = Array.isArray(parsed.results) ? parsed.results : [];
    const byId = new Map<string, BatchCandidateOut>();
    for (const row of arr) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const id = String(o.id ?? "").trim();
      if (!id) continue;
      byId.set(id, {
        id,
        match_score: clampScore(o.match_score),
        decision: String(o.decision ?? "Hold"),
        summary: typeof o.summary === "string" ? o.summary : undefined,
      });
    }
    const out: BatchCandidateOut[] = [];
    for (const c of inputs) {
      const sid = String(c.id);
      const hit = byId.get(sid);
      if (hit) out.push(hit);
      else out.push({ id: sid, match_score: 60, decision: "Hold" });
    }
    return out;
  };

  try {
    return await tryOnce();
  } catch (e) {
    if (isAbortError(e)) {
      return fallbackForAll(inputs);
    }
    try {
      await sleep(400);
      return await tryOnce();
    } catch {
      return fallbackForAll(inputs);
    }
  }
}

/**
 * Evaluate up to 5 candidates in one API call. Uses cache when Redis available.
 * `jdFull` should be full JD text; `jdTrim` is applied internally (1000 chars).
 */
export async function evaluateBatch(jdFull: string, candidates: BatchCandidateIn[]): Promise<BatchCandidateOut[]> {
  if (candidates.length === 0) return [];
  if (candidates.length > 5) {
    throw new Error("evaluateBatch: max 5 candidates per call");
  }

  const { cached, uncached } = await hydrateFromCache(jdFull, candidates);

  if (uncached.length === 0) {
    return candidates.map((c) => {
      const sid = String(c.id);
      const mem = cached.get(sid)!;
      return batchOutToCandidateOut(mem, sid);
    });
  }

  const fresh = await callOpenAiBatch(jdFull.slice(0, JD_MAX), uncached);

  for (let i = 0; i < uncached.length; i++) {
    const c = uncached[i]!;
    const sid = String(c.id);
    const b = fresh[i] ?? { id: sid, match_score: 60, decision: "Hold" };
    const ev: AiEvaluationResult = {
      candidate_name: String(c.name || "Unknown").trim() || "Unknown",
      match_score: b.match_score,
      decision: b.decision,
      strengths: [],
      gaps: [],
      risks: [],
      summary: b.summary || "—",
    };
    await setRedisJson(redisKeyForCandidate(jdFull, c.resumeText), ev, aiMatchingConfig.cacheTtlSec);
  }

  return candidates.map((c) => {
    const sid = String(c.id);
    const mem = cached.get(sid);
    if (mem) return batchOutToCandidateOut(mem, sid);
    const idx = uncached.findIndex((u) => String(u.id) === sid);
    if (idx >= 0 && fresh[idx]) return fresh[idx]!;
    return { id: sid, match_score: 60, decision: "Hold" };
  });
}
