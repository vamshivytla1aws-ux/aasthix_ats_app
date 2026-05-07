import type { HrAssistantPlan, HrEntity } from "./types";

const DEFAULT_REPORT_TZ = process.env.HR_ASSISTANT_REPORT_TZ || "Asia/Kolkata";
const ENTITIES_WITH_CALENDAR_FILTERS: HrEntity[] = ["interviews", "applications"];

/** ISO timestamps for Postgres `timestamptz` (UTC). */
function toIso(d: Date) {
  return d.toISOString();
}

function getTzParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: weekdayMap[map.weekday] ?? 0,
  };
}

function buildUtcInstantForTzDate(dateKey: string, timeZone: string, endOfDay = false) {
  const [year, month, day] = dateKey.split("-").map((v) => Number(v));
  const probeUtc = new Date(Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
  const probeParts = getTzParts(probeUtc, timeZone);
  const probeLocalUtc = Date.UTC(probeParts.year, probeParts.month - 1, probeParts.day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  const desiredUtc = Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return new Date(probeUtc.getTime() + (desiredUtc - probeLocalUtc));
}

function formatDateKeyFromTz(date: Date, timeZone: string) {
  const p = getTzParts(date, timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function shiftDateKey(dateKey: string, days: number) {
  const noon = new Date(`${dateKey}T12:00:00Z`);
  noon.setUTCDate(noon.getUTCDate() + days);
  return `${noon.getUTCFullYear()}-${String(noon.getUTCMonth() + 1).padStart(2, "0")}-${String(noon.getUTCDate()).padStart(2, "0")}`;
}

function getDateWindow(messageLower: string, now: Date, timeZone: string): { from: Date; to: Date } | null {
  const nowKey = formatDateKeyFromTz(now, timeZone);
  const nowParts = getTzParts(now, timeZone);

  if (
    /\bthis month\b|\bcurrent month\b|\bthis calendar month\b|\bin this month\b|\bfor this month\b|\bduring this month\b/.test(
      messageLower
    )
  ) {
    const startKey = `${nowParts.year}-${String(nowParts.month).padStart(2, "0")}-01`;
    const nextMonthYear = nowParts.month === 12 ? nowParts.year + 1 : nowParts.year;
    const nextMonth = nowParts.month === 12 ? 1 : nowParts.month + 1;
    const nextMonthStart = `${nextMonthYear}-${String(nextMonth).padStart(2, "0")}-01`;
    const endKey = shiftDateKey(nextMonthStart, -1);
    return {
      from: buildUtcInstantForTzDate(startKey, timeZone, false),
      to: buildUtcInstantForTzDate(endKey, timeZone, true),
    };
  }

  if (/\blast month\b/.test(messageLower)) {
    const thisMonthStart = `${nowParts.year}-${String(nowParts.month).padStart(2, "0")}-01`;
    const endKey = shiftDateKey(thisMonthStart, -1);
    const [ey, em] = endKey.split("-").map((v) => Number(v));
    const startKey = `${ey}-${String(em).padStart(2, "0")}-01`;
    return {
      from: buildUtcInstantForTzDate(startKey, timeZone, false),
      to: buildUtcInstantForTzDate(endKey, timeZone, true),
    };
  }

  if (/\bthis week\b|\bcurrent week\b/.test(messageLower)) {
    const diff = (nowParts.weekday + 6) % 7;
    const startKey = shiftDateKey(nowKey, -diff);
    const endKey = shiftDateKey(startKey, 6);
    return {
      from: buildUtcInstantForTzDate(startKey, timeZone, false),
      to: buildUtcInstantForTzDate(endKey, timeZone, true),
    };
  }

  if (/\bnext week\b/.test(messageLower)) {
    const diff = (nowParts.weekday + 6) % 7;
    const thisWeekStart = shiftDateKey(nowKey, -diff);
    const startKey = shiftDateKey(thisWeekStart, 7);
    const endKey = shiftDateKey(startKey, 6);
    return {
      from: buildUtcInstantForTzDate(startKey, timeZone, false),
      to: buildUtcInstantForTzDate(endKey, timeZone, true),
    };
  }

  if (/\btoday\b/.test(messageLower)) {
    return {
      from: buildUtcInstantForTzDate(nowKey, timeZone, false),
      to: buildUtcInstantForTzDate(nowKey, timeZone, true),
    };
  }

  return null;
}

/**
 * When the model omits date_from/date_to, infer from phrases like "this month" / "today".
 * Uses workspace timezone boundaries and stores UTC ISO filters for SQL.
 */
export function applyRelativeDatesFromMessage(plan: HrAssistantPlan, userMessage: string): HrAssistantPlan {
  if (plan.kind !== "query") return plan;
  if (!plan.entity || !ENTITIES_WITH_CALENDAR_FILTERS.includes(plan.entity)) return plan;
  if (plan.filters?.date_from || plan.filters?.date_to) return plan;

  const m = userMessage.toLowerCase();
  const window = getDateWindow(m, new Date(), DEFAULT_REPORT_TZ);
  if (!window) return plan;

  return {
    ...plan,
    filters: {
      ...plan.filters,
      date_from: toIso(window.from),
      date_to: toIso(window.to),
    },
  };
}

export function getHrAssistantReportingTimezone() {
  return DEFAULT_REPORT_TZ;
}

