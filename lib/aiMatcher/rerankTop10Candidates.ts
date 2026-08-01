import { TOP10_RERANK_JSON_SCHEMA, type Top10RerankAiRow, type Top10RerankParsed } from "@/lib/aiMatcher/top10RerankSchema";
import { TOP10_RERANK_PROMPT_VERSION, TOP10_RERANK_SYSTEM_PROMPT } from "@/lib/aiMatcher/top10RerankPrompt";
import type { Top10RerankPayload } from "@/lib/aiMatcher/buildTop10RerankPayload";

const DEFAULT_MODEL = process.env.MATCH_HYBRID_RERANK_MODEL ?? process.env.RESUME_MATCH_MODEL ?? process.env.MATCH_OPENAI_MODEL ?? "gpt-5.6-luna";
const ESCALATION_MODEL = process.env.MATCH_HYBRID_RERANK_MODEL_ESCALATION ?? process.env.FALLBACK_REVIEW_MODEL ?? "gpt-5.6-terra";
const RERANK_TIMEOUT_MS = Math.min(
  120_000,
  Math.max(15_000, Number(process.env.MATCH_HYBRID_RERANK_TIMEOUT_MS ?? 90_000))
);

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function normalizeDecision(d: string): "Proceed" | "Hold" | "Reject" {
  const s = (d || "").toLowerCase();
  if (s.includes("reject")) return "Reject";
  if (s.includes("hold")) return "Hold";
  return "Proceed";
}

function extractOutputText(json: Record<string, unknown>): string {
  const ot = json.output_text;
  if (typeof ot === "string" && ot.trim()) return ot;
  const output = json.output;
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const block of output) {
    if (!block || typeof block !== "object") continue;
    const content = (block as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const c of content) {
      if (c && typeof c === "object" && typeof (c as { text?: string }).text === "string") {
        parts.push((c as { text: string }).text);
      }
    }
  }
  return parts.join("\n").trim();
}

function parseJsonSafe(text: string): Top10RerankParsed | null {
  try {
    const o = JSON.parse(text) as Top10RerankParsed;
    if (!o || typeof o !== "object" || !Array.isArray(o.ranked_candidates)) return null;
    return o;
  } catch {
    return null;
  }
}

type ResponsesResult =
  | { ok: true; parsed: Top10RerankParsed; usage: Record<string, number | undefined>; latencyMs: number; modelUsed: string }
  | { ok: false; err: string; latencyMs: number };

async function openAiResponsesCall(
  model: string,
  userPayload: string,
  opts: { withReasoningVerbosity: boolean }
): Promise<ResponsesResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, err: "OPENAI_API_KEY is not set", latencyMs: 0 };

  const textFormat = {
    type: "json_schema" as const,
    name: "top10_rerank",
    strict: true,
    schema: TOP10_RERANK_JSON_SCHEMA,
  };

  const body: Record<string, unknown> = {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: TOP10_RERANK_SYSTEM_PROMPT }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userPayload }],
      },
    ],
    text: {
      format: textFormat,
      ...(opts.withReasoningVerbosity ? { verbosity: "low" } : {}),
    },
  };
  if (opts.withReasoningVerbosity) {
    body.reasoning = { effort: "none" };
  }

  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RERANK_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: ctrl.signal,
      body: JSON.stringify(body),
    });
    const latencyMs = Date.now() - started;
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, err: `openai ${res.status}: ${text.slice(0, 800)}`, latencyMs };
    }
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { ok: false, err: "invalid JSON from OpenAI", latencyMs };
    }
    const outText = extractOutputText(json);
    const parsed = parseJsonSafe(outText);
    if (!parsed) {
      return { ok: false, err: "could not parse structured output", latencyMs };
    }
    const usageRaw = json.usage as Record<string, number> | undefined;
    const usage: Record<string, number | undefined> = {
      input_tokens: usageRaw?.input_tokens ?? usageRaw?.prompt_tokens,
      output_tokens: usageRaw?.output_tokens ?? usageRaw?.completion_tokens,
      total_tokens: usageRaw?.total_tokens,
    };
    return { ok: true, parsed, usage, latencyMs, modelUsed: model };
  } catch (e) {
    const latencyMs = Date.now() - started;
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, err: msg, latencyMs };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Single OpenAI Responses API call with strict JSON schema. Validates IDs; fills gaps with No-AI order.
 */
export async function rerankTop10Candidates(opts: {
  payload: Top10RerankPayload;
  expectedCandidateIdsInOrder: string[];
}): Promise<
  | {
      ok: true;
      rankedCandidates: Top10RerankAiRow[];
      model: string;
      promptVersion: string;
      usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
      latencyMs: number;
    }
  | { ok: false; error: string }
> {
  const expected = new Set(opts.expectedCandidateIdsInOrder);
  if (expected.size === 0) {
    return { ok: false, error: "no candidate ids" };
  }

  const userPayload = JSON.stringify(opts.payload);

  let result = await openAiResponsesCall(DEFAULT_MODEL, userPayload, { withReasoningVerbosity: true });
  if (!result.ok && /reasoning|verbosity|unsupported|invalid/i.test(result.err)) {
    result = await openAiResponsesCall(DEFAULT_MODEL, userPayload, { withReasoningVerbosity: false });
  }
  if (!result.ok) {
    result = await openAiResponsesCall(ESCALATION_MODEL, userPayload, { withReasoningVerbosity: false });
  }

  if (!result.ok) {
    return { ok: false, error: result.err };
  }

  const { parsed, usage, latencyMs, modelUsed } = result;

  const cleaned: Top10RerankAiRow[] = [];
  const seen = new Set<string>();
  for (const row of parsed.ranked_candidates) {
    if (!row || typeof row.candidate_id !== "string") continue;
    const id = row.candidate_id.trim();
    if (!expected.has(id) || seen.has(id)) continue;
    seen.add(id);
    cleaned.push({
      candidate_id: id,
      final_rank: clampInt(Number(row.final_rank), 1, 10),
      ai_match_score: clampInt(Number(row.ai_match_score), 0, 100),
      ai_decision: normalizeDecision(String(row.ai_decision ?? "Hold")),
      reasoning: String(row.reasoning ?? "").slice(0, 400),
    });
  }

  const missing = opts.expectedCandidateIdsInOrder.filter((id) => !seen.has(id));
  let nextRank = cleaned.length > 0 ? Math.max(...cleaned.map((r) => r.final_rank)) + 1 : 1;
  for (const id of missing) {
    const fallbackOrder = opts.expectedCandidateIdsInOrder.indexOf(id) + 1;
    cleaned.push({
      candidate_id: id,
      final_rank: nextRank++,
      ai_match_score: clampInt(70 - fallbackOrder * 3, 0, 100),
      ai_decision: "Hold",
      reasoning: "Filled after model output — No-AI order fallback.",
    });
  }

  cleaned.sort((a, b) => a.final_rank - b.final_rank);

  const ranks = new Set(cleaned.map((r) => r.final_rank));
  if (ranks.size !== cleaned.length) {
    cleaned.forEach((r, i) => {
      r.final_rank = i + 1;
    });
  }

  return {
    ok: true,
    rankedCandidates: cleaned,
    model: modelUsed,
    promptVersion: TOP10_RERANK_PROMPT_VERSION,
    usage: {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.total_tokens,
    },
    latencyMs,
  };
}
