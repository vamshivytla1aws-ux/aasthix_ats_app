export const ATS_TIMEZONE = "Asia/Kolkata";
export const ATS_TIMEZONE_LABEL = "IST";
export const ATS_DATE_LOCALE = "en-IN";

export function formatInAtsTimezone(value: string | Date, options?: Intl.DateTimeFormatOptions) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const formatted = new Intl.DateTimeFormat(ATS_DATE_LOCALE, {
    timeZone: ATS_TIMEZONE,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    ...options,
  }).format(date);
  return formatted.replace(/\bam\b/gi, "AM").replace(/\bpm\b/gi, "PM");
}

export function formatAtsDate(value: string | Date) {
  return formatInAtsTimezone(value, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: undefined,
    minute: undefined,
  });
}

export function formatAtsTime(value: string | Date) {
  return formatInAtsTimezone(value, {
    year: undefined,
    month: undefined,
    day: undefined,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatAtsDateTimeWithZone(value: string | Date) {
  return `${formatInAtsTimezone(value)} ${ATS_TIMEZONE_LABEL}`;
}

export function kolkataLocalToUtcIso(datePart: string, timePart: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(datePart || "").trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(String(timePart || "").trim());
  if (!match || !timeMatch) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - (5 * 60 + 30) * 60 * 1000;
  return new Date(utcMs).toISOString();
}
