import type { UsageDateRange, UsageHealthStatus, UsagePreset } from "@/lib/usage/types";

export function resolveUsageDateRange(search: URLSearchParams): UsageDateRange {
  const preset = (search.get("preset") || "thisMonth") as UsagePreset;
  const now = new Date();

  const end = search.get("end");
  const start = search.get("start");

  if (preset === "custom" && start && end) {
    const customStart = new Date(start);
    const customEnd = new Date(end);
    if (!Number.isNaN(customStart.getTime()) && !Number.isNaN(customEnd.getTime())) {
      return {
        preset,
        start: customStart.toISOString(),
        end: customEnd.toISOString(),
      };
    }
  }

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { preset, start: dayStart.toISOString(), end: now.toISOString() };
    case "last7": {
      const from = new Date(dayStart);
      from.setDate(from.getDate() - 6);
      return { preset, start: from.toISOString(), end: now.toISOString() };
    }
    case "custom":
    case "thisMonth":
    default: {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { preset: preset === "custom" ? "thisMonth" : preset, start: from.toISOString(), end: now.toISOString() };
    }
  }
}

export function getCurrentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: start.toISOString(), end: now.toISOString() };
}

export function parseNumberEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clampRemaining(limit: number | null, used: number | null) {
  if (limit == null || used == null) return null;
  return Math.max(0, limit - used);
}

export function usagePercent(limit: number | null, used: number | null) {
  if (limit == null || used == null || limit <= 0) return null;
  return Math.max(0, (used / limit) * 100);
}

export function usageStatus(limit: number | null, used: number | null): UsageHealthStatus {
  const pct = usagePercent(limit, used);
  if (pct == null) return "Healthy";
  if (pct >= 100) return "Limit Reached";
  if (pct >= 90) return "Near Limit";
  if (pct >= 70) return "Warning";
  return "Healthy";
}

export function fmtDateOnly(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

export function stableNowIso() {
  return new Date().toISOString();
}

type CacheEntry<T> = { expiresAt: number; value: T };

const memoryCache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs = 5 * 60_000) {
  memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function maybeBypassCache(search: URLSearchParams) {
  return search.get("refresh") === "1";
}
