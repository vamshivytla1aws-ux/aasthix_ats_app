import { afterEach, describe, expect, it } from "vitest";
import { getAiModelConfig, withCostControlledModel } from "@/lib/ai/modelConfig";

const MANAGED_ENV = [
  "RESUME_MATCH_MODEL",
  "MATCH_OPENAI_MODEL",
  "INTERVIEW_QUESTION_MODEL",
  "AI_INTERVIEW_MODEL",
  "INTERVIEW_EVALUATION_MODEL",
  "AI_INTERVIEW_EVALUATION_MODEL",
  "INTERVIEW_TRANSCRIPTION_MODEL",
  "AI_INTERVIEW_TRANSCRIPTION_MODEL",
  "FALLBACK_REVIEW_MODEL",
  "FALLBACK_REVIEW_ENABLED",
  "MAX_FALLBACK_REVIEWS_PER_REQUEST",
] as const;

const ORIGINAL_ENV = Object.fromEntries(MANAGED_ENV.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of MANAGED_ENV) {
    const value = ORIGINAL_ENV[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("cost-controlled AI model routing", () => {
  it("uses the preferred model variables ahead of legacy aliases", () => {
    process.env.RESUME_MATCH_MODEL = "gpt-5.6-luna";
    process.env.MATCH_OPENAI_MODEL = "legacy-match-model";
    process.env.INTERVIEW_EVALUATION_MODEL = "gpt-5.6-luna";
    process.env.AI_INTERVIEW_EVALUATION_MODEL = "legacy-interview-model";

    const config = getAiModelConfig();

    expect(config.resumeMatchModel).toBe("gpt-5.6-luna");
    expect(config.interviewEvaluationModel).toBe("gpt-5.6-luna");
  });

  it("disables reasoning and unsupported temperature for GPT-5.6", () => {
    const body = withCostControlledModel({ temperature: 0.2, messages: [] }, "gpt-5.6-luna");

    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.reasoning_effort).toBe("none");
    expect(body).not.toHaveProperty("temperature");
  });

  it("limits Terra reviews to one and supports disabling fallback", () => {
    process.env.MAX_FALLBACK_REVIEWS_PER_REQUEST = "9";
    process.env.FALLBACK_REVIEW_ENABLED = "false";

    const config = getAiModelConfig();

    expect(config.maxFallbackReviewsPerRequest).toBe(1);
    expect(config.fallbackReviewEnabled).toBe(false);
  });
});
