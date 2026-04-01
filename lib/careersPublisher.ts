/**
 * Public careers portal lists jobs for a single recruiter workspace.
 * Set CAREERS_PUBLISHER_USER_ID to that user's numeric id (same account that owns the jobs).
 */
export function getCareersPublisherUserId(): number | null {
  const raw = process.env.CAREERS_PUBLISHER_USER_ID;
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

/** Digits only for matching; keeps display value separate */
export function normalizePhoneDigits(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function isValidEmail(email: string) {
  return EMAIL_RE.test(String(email || "").trim());
}

export const CAREERS_APPLICATION_SOURCE = "Careers Page";
export const DEFAULT_UI_SOURCE = "UI";
