/**
 * OpenAI text embeddings (text-embedding-3-small, 1536 dims).
 * Set OPENAI_BASE_URL to use Azure or regional proxy (same path /v1/embeddings).
 */

const EMBEDDING_MODEL = process.env.MATCH_EMBEDDING_MODEL || "text-embedding-3-small";
const DIM = 1536;

const MIN_MS = 5_000;
const MAX_MS = 120_000;

function embeddingTimeoutMs(): number {
  const n = Number(process.env.MATCH_EMBEDDING_TIMEOUT_MS);
  return Number.isFinite(n) && n >= MIN_MS ? Math.min(MAX_MS, n) : 60_000;
}

function apiBase(): string {
  const raw = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  return raw.endsWith("/v1") ? raw : `${raw}/v1`;
}

async function postEmbeddings(body: Record<string, unknown>): Promise<Response> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");

  const ms = embeddingTimeoutMs();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(`${apiBase()}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function embeddingDimensions(): number {
  return DIM;
}

export async function createEmbedding(text: string): Promise<number[]> {
  const t = String(text || "").slice(0, 30_000);
  if (!t.trim()) return new Array(DIM).fill(0);
  const res = await postEmbeddings({
    model: EMBEDDING_MODEL,
    input: t,
    dimensions: DIM,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI embeddings HTTP ${res.status}: ${err.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: { embedding?: number[] }[] };
  const emb = json?.data?.[0]?.embedding;
  if (!Array.isArray(emb) || emb.length !== DIM) {
    throw new Error("Invalid embedding response");
  }
  return emb;
}

/** Batch embeddings (chunked). Preserves order. */
export async function createEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const chunkSize = Math.min(100, Math.max(1, Number(process.env.MATCH_EMBEDDING_BATCH_SIZE || 32)));
  const out: number[][] = [];
  const zero = () => new Array(DIM).fill(0);
  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize).map((t) => String(t || "").slice(0, 30_000));
    const res = await postEmbeddings({
      model: EMBEDDING_MODEL,
      input: chunk,
      dimensions: DIM,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`OpenAI embeddings batch HTTP ${res.status}: ${err.slice(0, 200)}`);
    }
    const json = (await res.json()) as { data?: { index?: number; embedding?: number[] }[] };
    const rows = Array.isArray(json.data) ? [...json.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)) : [];
    for (let j = 0; j < chunk.length; j++) {
      const emb = rows[j]?.embedding;
      if (!Array.isArray(emb) || emb.length !== DIM) out.push(zero());
      else out.push(emb);
    }
  }
  return out;
}

export { EMBEDDING_MODEL };
