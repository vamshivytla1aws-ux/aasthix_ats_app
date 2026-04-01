import IORedis from "ioredis";

let conn: IORedis | null = null;
let connectionFailed = false;

/**
 * BullMQ requires `maxRetriesPerRequest: null`. Uses REDIS_URL or localhost fallback.
 * Does not throw on init — connection errors are logged; callers should handle null.
 */
export function getBullConnection(): IORedis | null {
  if (connectionFailed) return null;
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  if (!conn) {
    try {
      conn = new IORedis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
        retryStrategy: () => null,
      });
      conn.on("error", (e) => {
        console.warn("[queue] Redis error (non-fatal):", String(e.message || e));
      });
    } catch (e) {
      console.warn("[queue] Redis init failed:", String(e));
      connectionFailed = true;
      return null;
    }
  }
  return conn;
}

export function isQueueEnabled(): boolean {
  return !connectionFailed;
}
