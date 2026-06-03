/**
 * Cross-encoder–style rerank in one chat call: JD ↔ candidate snippets → 0–100 scores.
 * Cheaper than per-candidate chat; stronger than cosine alone for top-K.
 */
import { fetchOpenAiChatCompletions, isAbortError } from "@/lib/openaiChat";
import { aiMatchingConfig } from "@/lib/config/aiMatching";

const JD_MAX = 1_400;
const SNIP_MAX = 450;

function batchModel(): string {
  return process.env.MATCH_PAIR_RERANK_MODEL || process.env.MATCH_BATCH_OPENAI_MODEL || "gpt-4o";
}

export type PairRerankIn = { id: number; name: string; snippet: string };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function clampScore(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 50;
  return Math.max(0, Math.min(100, Math.round(x)));
}

/**
 * One API call for up to `maxItems` candidates (default 40).
 */
export async function pairRerankScores(jdText: string, items: PairRerankIn[], maxItems = 40): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (items.length === 0) return out;
  const slice = items.slice(0, maxItems);
  const jd = String(jdText || "").slice(0, JD_MAX);

  const blocks = slice.map((c) => {
    const sn = String(c.snippet || "").slice(0, SNIP_MAX);
    return `ID:${c.id} NAME:${(c.name || "").slice(0, 80)}\nSNIP:${sn}\n---`;
  });

  const userPrompt = `JOB:\n${jd}\n\nCANDIDATES:\n${blocks.join("\n")}\n\nReturn JSON only:\n{"scores":[{"id":<number>,"score":0-100}]}\nScore each candidate's fit to the job independently.`;

  const body = {
    model: batchModel(),
    temperature: 0.1,
    response_format: { type: "json_object" as const },
    messages: [
      {
        role: "system" as const,
        content:
          "You score resume snippets against a job description. Output valid JSON only. Be strict but fair.",
      },
      { role: "user" as const, content: userPrompt },
    ],
  };

  const tryParse = async (): Promise<void> => {
    const res = await fetchOpenAiChatCompletions(body, aiMatchingConfig.timeoutMs);
    if (!res.ok) throw new Error(`pair rerank HTTP ${res.status}`);
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json?.choices?.[0]?.message?.content;
    if (!text) throw new Error("empty pair rerank");
    const parsed = JSON.parse(text) as { scores?: { id?: unknown; score?: unknown }[] };
    const arr = Array.isArray(parsed.scores) ? parsed.scores : [];
    for (const row of arr) {
      const id = Number(row?.id);
      if (!Number.isFinite(id)) continue;
      out.set(id, clampScore(row?.score));
    }
  };

  try {
    await tryParse();
  } catch (e) {
    if (isAbortError(e)) return out;
    await sleep(300);
    try {
      await tryParse();
    } catch {
      for (const c of slice) out.set(c.id, 50);
    }
  }

  for (const c of slice) {
    if (!out.has(c.id)) out.set(c.id, 50);
  }
  return out;
}
