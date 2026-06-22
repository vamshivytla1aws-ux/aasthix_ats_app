import { getCareersPublisherUserId, isValidEmail, normalizeEmail, normalizePhoneDigits } from "@/lib/careersPublisher";

export function getTrainingPublisherUserId(): number | null {
  const raw = process.env.TRAINING_PUBLISHER_USER_ID;
  if (raw != null && String(raw).trim() !== "") {
    const n = Number(String(raw).trim());
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return getCareersPublisherUserId();
}

export { isValidEmail, normalizeEmail, normalizePhoneDigits };

export const TRAINING_SOURCE_PUBLIC = "public_training";
export const TRAINING_SOURCE_INTERNAL = "internal_training";
