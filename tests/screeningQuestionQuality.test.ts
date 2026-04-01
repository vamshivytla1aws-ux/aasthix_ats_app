import { describe, expect, it } from "vitest";
import { applyQuestionQualityControls } from "@/lib/screeningQuestionQuality";

describe("applyQuestionQualityControls", () => {
  it("deduplicates near-identical questions", () => {
    const out = applyQuestionQualityControls(
      [
        { question_type: "technical", question_text: "How do you test APIs in production?", sort_order: 1 },
        { question_type: "technical", question_text: "how do you test apis in production", sort_order: 2 },
        { question_type: "scenario", question_text: "Describe handling a production outage with clear steps.", sort_order: 3 },
        { question_type: "scenario", question_text: "Walk through ambiguous requirements and delivery.", sort_order: 4 },
        { question_type: "technical", question_text: "What trade-offs matter for database indexing?", sort_order: 5 },
      ],
      { minCount: 5, maxCount: 8 }
    );
    expect(out.length).toBeGreaterThanOrEqual(3);
    const texts = out.map((q) => q.question_text.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("drops blacklist / AI-meta phrases", () => {
    const out = applyQuestionQualityControls(
      [
        { question_type: "technical", question_text: "As an AI language model, answer this coding question.", sort_order: 1 },
        { question_type: "scenario", question_text: "Describe your approach to stakeholder communication under deadlines.", sort_order: 2 },
        { question_type: "technical", question_text: "How do you validate assumptions before building a feature?", sort_order: 3 },
        { question_type: "scenario", question_text: "Explain incident response when users cannot log in.", sort_order: 4 },
        { question_type: "technical", question_text: "What does code review mean to you in a team setting?", sort_order: 5 },
      ],
      { minCount: 5, maxCount: 8 }
    );
    const joined = out.map((q) => q.question_text).join(" ").toLowerCase();
    expect(joined.includes("as an ai")).toBe(false);
  });
});
