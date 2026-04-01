/** Split candidates into fixed-size batches (one OpenAI call per batch). */
export const BATCH_SIZE = 5;

export function chunkCandidates<T>(items: T[], size = BATCH_SIZE): T[][] {
  if (size < 1) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
