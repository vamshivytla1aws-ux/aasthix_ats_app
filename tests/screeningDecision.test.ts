import { describe, expect, it } from "vitest";
import { nextStageFromScreeningScore } from "@/lib/screeningDecision";

describe("nextStageFromScreeningScore", () => {
  it("moves to Interview at 70+", () => {
    expect(nextStageFromScreeningScore(70)).toBe("Interview");
    expect(nextStageFromScreeningScore(100)).toBe("Interview");
  });
  it("moves to Screening Failed below 70", () => {
    expect(nextStageFromScreeningScore(69)).toBe("Screening Failed");
    expect(nextStageFromScreeningScore(0)).toBe("Screening Failed");
  });
});
