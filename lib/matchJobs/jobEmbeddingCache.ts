import { createHash } from "crypto";
import { query } from "@/lib/db";
import { createEmbedding, embeddingDimensions } from "@/lib/embeddings/openaiEmbeddings";
import { toPgVectorLiteral } from "@/lib/embeddings/pgVector";

export function jdContentHash(jdText: string): string {
  return createHash("sha256").update(String(jdText || ""), "utf8").digest("hex");
}

export async function getOrCreateJobEmbedding(jobId: number, jdText: string): Promise<number[]> {
  const hash = jdContentHash(jdText);
  const hit = await query(
    `SELECT content_hash, embedding::text AS emb FROM job_embedding_cache WHERE job_id = $1 LIMIT 1`,
    [jobId]
  );
  const row = hit.rows[0] as { content_hash: string; emb: string } | undefined;
  if (row && row.content_hash === hash && row.emb) {
    const parsed = parsePgVectorText(row.emb);
    if (parsed.length === embeddingDimensions()) return parsed;
  }
  const vec = await createEmbedding(jdText.slice(0, 12_000));
  const lit = toPgVectorLiteral(vec);
  await query(
    `INSERT INTO job_embedding_cache (job_id, content_hash, embedding, updated_at)
     VALUES ($1, $2, $3::vector, NOW())
     ON CONFLICT (job_id) DO UPDATE SET
       content_hash = EXCLUDED.content_hash,
       embedding = EXCLUDED.embedding,
       updated_at = NOW()`,
    [jobId, hash, lit]
  );
  return vec;
}

function parsePgVectorText(s: string): number[] {
  const t = String(s || "").trim();
  if (t.startsWith("[") && t.endsWith("]")) {
    try {
      const arr = JSON.parse(t) as unknown;
      if (Array.isArray(arr)) return arr.map((x) => Number(x)).filter((n) => Number.isFinite(n));
    } catch {
      /* fall through */
    }
  }
  return t
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n));
}
