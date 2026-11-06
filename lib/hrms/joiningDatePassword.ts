/** Strict date-only parsing keeps the password independent of server timezone. */
export function passwordFromJoiningDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter a valid date of joining.");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Enter a valid date of joining.");
  }
  return `${String(day).padStart(2, "0")}${String(month).padStart(2, "0")}${year}`;
}
