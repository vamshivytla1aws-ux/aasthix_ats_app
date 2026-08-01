/**
 * Chat completions with hard timeouts so API routes never hang indefinitely on stalled HTTP.
 */

import { withCostControlledModel } from "@/lib/ai/modelConfig";

const DEFAULT_MS = 90_000;
const MIN_MS = 8_000;
const MAX_BATCH_MS = 240_000;

export function openAiChatTimeoutMs(kind: "jd_extract" | "match_batch"): number {
  const base = Number(process.env.MATCH_OPENAI_TIMEOUT_MS);
  const fallback = Number.isFinite(base) && base >= MIN_MS ? base : DEFAULT_MS;
  if (kind === "jd_extract") {
    const jd = Number(process.env.MATCH_OPENAI_JD_TIMEOUT_MS);
    return Number.isFinite(jd) && jd >= MIN_MS ? Math.min(MAX_BATCH_MS, jd) : fallback;
  }
  const batch = Number(process.env.MATCH_OPENAI_BATCH_TIMEOUT_MS);
  if (Number.isFinite(batch) && batch >= MIN_MS) {
    return Math.min(MAX_BATCH_MS, batch);
  }
  return Math.min(MAX_BATCH_MS, Math.round(fallback * 1.5));
}

export async function fetchOpenAiChatCompletions(
  body: Record<string, unknown>,
  timeoutMs: number
): Promise<Response> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const ms = Math.max(MIN_MS, Math.min(MAX_BATCH_MS, timeoutMs));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  const model = typeof body.model === "string" ? body.model : "";
  const requestBody = model ? withCostControlledModel(body, model) : body;
  try {
    return await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function costControlledChatBody(body: Record<string, unknown>, model: string) {
  return withCostControlledModel(body, model);
}

export function isAbortError(e: unknown): boolean {
  return (
    (e instanceof Error && e.name === "AbortError") ||
    (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError")
  );
}
