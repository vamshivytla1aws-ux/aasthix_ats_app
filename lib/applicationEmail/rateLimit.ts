type Bucket = { count: number; resetAt: number };

const draftBuckets = new Map<string, Bucket>();
const sendBuckets = new Map<string, Bucket>();

function check(
  map: Map<string, Bucket>,
  key: string,
  opts: { max: number; windowMs: number }
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let b = map.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + opts.windowMs };
    map.set(key, b);
  }
  if (b.count >= opts.max) {
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }
  b.count += 1;
  return { ok: true };
}

export function checkApplicationEmailDraftRateLimit(
  userId: number,
  opts: { max: number; windowMs: number }
): { ok: true } | { ok: false; retryAfterSec: number } {
  return check(draftBuckets, `draft:${userId}`, opts);
}

export function checkApplicationEmailSendRateLimit(
  userId: number,
  opts: { max: number; windowMs: number }
): { ok: true } | { ok: false; retryAfterSec: number } {
  return check(sendBuckets, `send:${userId}`, opts);
}
