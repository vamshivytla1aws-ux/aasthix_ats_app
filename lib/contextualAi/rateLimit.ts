type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Per-user sliding window; in-process (use Redis for multi-instance). */
export function checkContextualAiRateLimit(
  userId: number,
  opts: { max: number; windowMs: number }
): { ok: true } | { ok: false; retryAfterSec: number } {
  const key = `ctxai:${userId}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(key, b);
  }
  if (b.count >= opts.max) {
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  b.count += 1;
  return { ok: true };
}
