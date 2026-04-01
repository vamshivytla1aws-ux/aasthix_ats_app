type Bucket = { count: number; resetAt: number };

const buckets = new Map<number, Bucket>();

/** Simple sliding-window limit per user (in-process; use Redis in multi-instance prod). */
export function checkHrAssistantRateLimit(
  userId: number,
  opts: { max: number; windowMs: number }
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let b = buckets.get(userId);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(userId, b);
  }
  if (b.count >= opts.max) {
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  b.count += 1;
  return { ok: true };
}
