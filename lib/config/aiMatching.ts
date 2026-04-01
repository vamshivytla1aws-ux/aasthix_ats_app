/**
 * Batch AI matching — conservative defaults (sequential batches, minimal 429 risk).
 */

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const aiMatchingConfig = {
  /** @deprecated Batch path ignores parallel AI concurrency; kept for env compat. */
  concurrency: Math.min(12, Math.max(1, num(process.env.AI_CONCURRENCY, 1))),
  /** BullMQ: max 1 job start per second (strict throttle). */
  rateLimitMax: Math.min(100, Math.max(1, num(process.env.AI_RATE_LIMIT, 1))),
  rateLimitDurationMs: Math.max(100, num(process.env.AI_RATE_LIMIT_DURATION_MS, 1000)),
  /** Outer retries removed from batch path; safe wrapper uses max 1 retry only inside batchEvaluate. */
  retryAttempts: Math.min(10, Math.max(1, num(process.env.AI_RETRY_ATTEMPTS, 1))),
  timeoutMs: Math.min(300_000, Math.max(5_000, num(process.env.AI_TIMEOUT, 30_000))),
  cacheTtlSec: Math.min(7 * 24 * 3600, Math.max(60, num(process.env.AI_CACHE_TTL_SEC, 3600))),
  circuitFailureThreshold: Math.min(20, Math.max(2, num(process.env.AI_CIRCUIT_FAILURE_THRESHOLD, 5))),
  circuitPauseMs: Math.min(120_000, Math.max(1000, num(process.env.AI_CIRCUIT_PAUSE_MS, 15_000))),
  autoPauseFailureThreshold: num(process.env.AI_QUEUE_AUTO_PAUSE_THRESHOLD, 5),
  autoPauseWindowMs: num(process.env.AI_QUEUE_AUTO_PAUSE_WINDOW_MS, 60_000),
  autoPauseDurationMs: num(process.env.AI_QUEUE_AUTO_PAUSE_MS, 15_000),
  /** Worker: single job at a time (sequential batch processing inside). */
  workerConcurrency: Math.min(8, Math.max(1, num(process.env.AI_WORKER_CONCURRENCY, 1))),
  bullmqAttempts: Math.min(20, Math.max(1, num(process.env.AI_BULLMQ_ATTEMPTS, 3))),
};
