import crypto from "crypto";

type CacheEntry<T> = { value: T; expires: number };

const store = new Map<string, CacheEntry<unknown>>();

function maxEntries() {
  const n = Number(process.env.MATCH_AI_CACHE_MAX ?? 500);
  return Math.min(10_000, Math.max(50, Number.isFinite(n) ? n : 500));
}

function ttlMs() {
  const n = Number(process.env.MATCH_AI_CACHE_TTL_MS ?? 86_400_000);
  return Math.min(7 * 24 * 60 * 60 * 1000, Math.max(60_000, Number.isFinite(n) ? n : 86_400_000));
}

/**
 * Stable cache key from JD + resume text (SHA-256; in-process TTL via MATCH_AI_CACHE_TTL_MS).
 * For multi-instance Redis, add a shared layer later — single-node deploys use this store.
 */
export function matchCacheKey(jd: string, resume: string): string {
  const h = crypto.createHash("sha256");
  h.update(jd.slice(0, 12_000));
  h.update("\n---\n");
  h.update(resume.slice(0, 16_000));
  return h.digest("hex");
}

export function getMatchCache<T>(key: string): T | null {
  if (process.env.MATCH_AI_CACHE_DISABLED === "1") return null;
  const e = store.get(key) as CacheEntry<T> | undefined;
  if (!e) return null;
  if (Date.now() > e.expires) {
    store.delete(key);
    return null;
  }
  return e.value;
}

export function setMatchCache<T>(key: string, value: T): void {
  if (process.env.MATCH_AI_CACHE_DISABLED === "1") return;
  const max = maxEntries();
  while (store.size >= max) {
    const first = store.keys().next().value as string | undefined;
    if (first) store.delete(first);
    else break;
  }
  store.set(key, { value, expires: Date.now() + ttlMs() });
}
