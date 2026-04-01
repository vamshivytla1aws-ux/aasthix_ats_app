/**
 * Redis cache for AI JSON. Uses REDIS_URL or localhost; failures are silent (no cache).
 */
import Redis from "ioredis";

let shared: Redis | null | undefined;

function redisUrl(): string {
  return process.env.REDIS_URL || "redis://127.0.0.1:6379";
}

export function getRedisClient(): Redis | null {
  if (shared !== undefined) return shared;
  try {
    shared = new Redis(redisUrl(), {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    shared.on("error", (e) => console.warn("[cacheService] Redis:", String(e.message || e)));
    return shared;
  } catch (e) {
    console.warn("[cacheService] Redis unavailable:", String(e));
    shared = null;
    return null;
  }
}

export async function getRedisJson<T>(key: string): Promise<T | null> {
  const r = getRedisClient();
  if (!r) return null;
  try {
    const raw = await r.get(key);
    if (raw == null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setRedisJson(key: string, value: unknown, ttlSec: number): Promise<void> {
  const r = getRedisClient();
  if (!r) return;
  try {
    await r.set(key, JSON.stringify(value), "EX", Math.max(60, Math.floor(ttlSec)));
  } catch {
    /* skip */
  }
}

export async function redisPing(): Promise<boolean> {
  const r = getRedisClient();
  if (!r) return false;
  try {
    const p = await r.ping();
    return p === "PONG";
  } catch {
    return false;
  }
}
