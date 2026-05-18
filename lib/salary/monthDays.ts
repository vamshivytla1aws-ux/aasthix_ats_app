export function getMonthDays(year: number, month: number) {
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 30;
  if (month < 1 || month > 12) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function getMonthDaysFromDateString(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return 30;
  const [yearPart, monthPart] = raw.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return 30;
  return getMonthDays(year, month);
}

