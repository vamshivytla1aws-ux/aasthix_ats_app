import type { HrAssistantPlan, HrEntity } from "./types";

/** ISO timestamps for Postgres `timestamptz` (UTC). */
function toIso(d: Date) {
  return d.toISOString();
}

const ENTITIES_WITH_CALENDAR_FILTERS: HrEntity[] = ["interviews", "applications"];

/**
 * When the model omits date_from/date_to, infer from phrases like "this month" / "today".
 * Applies to interview-style queries and pipeline questions with clear time windows.
 */
export function applyRelativeDatesFromMessage(plan: HrAssistantPlan, userMessage: string): HrAssistantPlan {
  if (plan.kind !== "query") return plan;
  if (!plan.entity || !ENTITIES_WITH_CALENDAR_FILTERS.includes(plan.entity)) return plan;
  if (plan.filters?.date_from || plan.filters?.date_to) return plan;

  const m = userMessage.toLowerCase();
  const now = new Date();

  let from: Date | null = null;
  let to: Date | null = null;

  if (
    /\bthis month\b|\bcurrent month\b|\bthis calendar month\b|\bin this month\b|\bfor this month\b|\bduring this month\b/.test(
      m
    )
  ) {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  } else if (/\blast month\b/.test(m)) {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0));
    to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
  } else if (/\bthis week\b|\bcurrent week\b/.test(m)) {
    const day = now.getUTCDay();
    const diff = (day + 6) % 7;
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff, 0, 0, 0, 0));
    to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff + 6, 23, 59, 59, 999));
  } else if (/\btoday\b/.test(m)) {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  } else if (/\bnext week\b/.test(m)) {
    const day = now.getUTCDay();
    const diff = (day + 6) % 7;
    const startThisWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
    from = new Date(Date.UTC(startThisWeek.getUTCFullYear(), startThisWeek.getUTCMonth(), startThisWeek.getUTCDate() + 7, 0, 0, 0, 0));
    to = new Date(Date.UTC(startThisWeek.getUTCFullYear(), startThisWeek.getUTCMonth(), startThisWeek.getUTCDate() + 13, 23, 59, 59, 999));
  }

  if (!from || !to) return plan;

  return {
    ...plan,
    filters: {
      ...plan.filters,
      date_from: toIso(from),
      date_to: toIso(to),
    },
  };
}
