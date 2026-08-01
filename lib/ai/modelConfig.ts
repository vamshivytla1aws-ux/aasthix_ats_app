export type InterviewTranscriptionMode = "off" | "missing_or_short" | "always";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function boolEnv(name: string, fallback: boolean) {
  const value = env(name).toLowerCase();
  if (!value) return fallback;
  return !["0", "false", "no", "off"].includes(value);
}

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(env(name));
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

export function getAiModelConfig() {
  const transcriptionModeRaw = env("INTERVIEW_TRANSCRIPTION_MODE").toLowerCase();
  const transcriptionMode: InterviewTranscriptionMode = ["off", "missing_or_short", "always"].includes(transcriptionModeRaw)
    ? transcriptionModeRaw as InterviewTranscriptionMode
    : "missing_or_short";
  return {
    resumeMatchModel: env("RESUME_MATCH_MODEL") || env("MATCH_OPENAI_MODEL") || "gpt-5.6-luna",
    interviewQuestionModel: env("INTERVIEW_QUESTION_MODEL") || env("AI_INTERVIEW_MODEL") || "gpt-5.6-luna",
    interviewEvaluationModel: env("INTERVIEW_EVALUATION_MODEL") || env("AI_INTERVIEW_EVALUATION_MODEL") || env("AI_INTERVIEW_MODEL") || "gpt-5.6-luna",
    interviewTranscriptionModel: env("INTERVIEW_TRANSCRIPTION_MODEL") || env("AI_INTERVIEW_TRANSCRIPTION_MODEL") || "gpt-4o-mini-transcribe",
    fallbackReviewModel: env("FALLBACK_REVIEW_MODEL") || "gpt-5.6-terra",
    fallbackReviewEnabled: boolEnv("FALLBACK_REVIEW_ENABLED", true),
    transcriptionMode,
    transcriptionMinChars: numberEnv("INTERVIEW_TRANSCRIPTION_MIN_CHARS", 80, 0, 2_000),
    maxFallbackReviewsPerRequest: Math.round(numberEnv("MAX_FALLBACK_REVIEWS_PER_REQUEST", 1, 0, 1)),
  };
}

export function isGpt56Model(model: string) {
  return /^gpt-5\.6(?:-|$)/i.test(model.trim());
}

/** Preserve the old non-reasoning behavior so GPT-5.6 does not silently add cost and latency. */
export function withCostControlledModel<T extends Record<string, unknown>>(body: T, model: string): T & Record<string, unknown> {
  const result: Record<string, unknown> = { ...body, model };
  if (isGpt56Model(model)) {
    delete result.temperature;
    result.reasoning_effort = "none";
  }
  return result as T & Record<string, unknown>;
}
