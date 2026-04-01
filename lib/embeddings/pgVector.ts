/** Format a float array for pgvector `::vector` casts (1536-d for text-embedding-3-small). */
export function toPgVectorLiteral(vec: number[]): string {
  if (vec.length === 0) throw new Error("empty embedding");
  return `[${vec.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

/** Map pgvector cosine distance (0 = identical, 2 = opposite for unit vectors) to 0–100. */
export function scoreFromCosineDistance(dist: number): number {
  const d = Number(dist);
  if (!Number.isFinite(d)) return 0;
  const s = 100 * Math.max(0, Math.min(1, 1 - d / 2));
  return Math.round(s);
}
