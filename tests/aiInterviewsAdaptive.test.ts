import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAdaptiveInterviewPlan,
  depthFromExperience,
  updateAdaptiveState,
  type AdaptiveAnswerAnalysis,
  type AdaptiveState,
} from "@/lib/aiInterviews/adaptive";

function analysis(score: number): AdaptiveAnswerAnalysis {
  return {
    answerSummary: "Candidate described an implementation.",
    score,
    technicalAccuracy: score,
    practicalEvidence: score,
    depth: score,
    clarity: score,
    answeredExpectedSignals: [],
    missingExpectedSignals: [],
    vagueClaims: [],
    contradictions: [],
    newRelevantTopics: [],
    claimsRequiringVerification: [],
    recommendedNextStrategy: "TEST_MANDATORY_JD_SKILL",
    recommendedDifficulty: "IMPLEMENTATION",
  };
}

function state(): AdaptiveState {
  const fallbackQuestion = {
    strategy: "TEST_TROUBLESHOOTING" as const,
    question:
      "Describe a practical Python problem and how you verified the result.",
    skill: "Python",
    projectName: null,
    difficulty: "ADVANCED" as const,
    sourceType: "FALLBACK" as const,
    sourceReference: "Python",
    reasonForAsking: "Fallback validation.",
    expectedSignals: ["Implementation"],
    maximumAnswerSeconds: 180,
  };
  return {
    currentDifficulty: "ADVANCED",
    questionsAsked: 1,
    maximumQuestions: 7,
    consecutiveStrongAnswers: 0,
    consecutiveWeakAnswers: 0,
    skillsCovered: [
      { skill: "Python", coverage: 0, confidence: "LOW", questionsAsked: 0 },
    ],
    skillsRemaining: ["Python"],
    projectsCovered: [],
    unverifiedClaims: [],
    previousAnswerSummary: "",
    previousAnswerScore: null,
    fallbackQuestion,
    strategyCounts: { mandatory: 1, project: 0, scenario: 0, followUp: 0 },
  };
}

describe("adaptive AI interview policy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("maps candidate experience to bounded interview depth", () => {
    expect(depthFromExperience(0)).toBe("FOUNDATION");
    expect(depthFromExperience(2)).toBe("IMPLEMENTATION");
    expect(depthFromExperience(4)).toBe("ADVANCED");
    expect(depthFromExperience(8)).toBe("ARCHITECTURE");
  });

  it("raises depth after two strong answers and lowers it after two weak answers", () => {
    const firstStrong = updateAdaptiveState(
      state(),
      analysis(8),
      "Python",
      null,
      "TEST_MANDATORY_JD_SKILL",
    );
    const secondStrong = updateAdaptiveState(
      firstStrong,
      analysis(8),
      "Python",
      null,
      "DEEPEN_TECHNICAL_TOPIC",
    );
    expect(secondStrong.currentDifficulty).toBe("ARCHITECTURE");
    const firstWeak = updateAdaptiveState(
      secondStrong,
      analysis(2),
      "Python",
      null,
      "TEST_MANDATORY_JD_SKILL",
    );
    const secondWeak = updateAdaptiveState(
      firstWeak,
      analysis(2),
      "Python",
      null,
      "TEST_MANDATORY_JD_SKILL",
    );
    expect(secondWeak.currentDifficulty).toBe("ADVANCED");
  });

  it("uses a neutral evidence question when no resume project can be proven", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const plan = await buildAdaptiveInterviewPlan({
      title: "Backend Engineer",
      jd: "Strong Python and REST API experience required.",
      resume: "Python developer with API experience.",
      skills: ["Python"],
      config: {
        maxQuestions: 7,
        projectQuestionsEnabled: true,
        minProjectQuestions: 2,
        maxFollowUpsPerTopic: 2,
        scenarioPercentage: 15,
        codingEnabled: false,
        behavioralEnabled: false,
        allowFundamentalsForSenior: false,
        recruiterExperienceOverride: 3,
      },
    });
    expect(plan.context.candidateContext.projects).toEqual([]);
    expect(plan.opening.sourceType).toBe("JD_SKILL");
    expect(plan.opening.question).toContain("most recent project");
  });
});
