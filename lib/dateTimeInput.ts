export function normalizeDateInput(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  const match = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(value);
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const year = Number(match?.[3] ?? isoMatch?.[1]);
  const month = Number(match?.[2] ?? isoMatch?.[2]);
  const day = Number(match?.[1] ?? isoMatch?.[3]);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeTimeInput(raw: string) {
  const value = raw.trim();
  if (!value) return "";
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(value);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3]?.toUpperCase();
  if (minute > 59 || (suffix ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (suffix === "PM" && hour < 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
