import { describe, expect, it } from "vitest";
import { normalizeEvaluatorScoreTo100 } from "@/lib/screeningScoreNormalize";

describe("normalizeEvaluatorScoreTo100", () => {
  it("maps 0–10 + high-quality to 0–100 (fixes model mistake)", () => {
    expect(normalizeEvaluatorScoreTo100(9, "high-quality")).toBe(90);
    expect(normalizeEvaluatorScoreTo100(8, "average")).toBe(80);
    expect(normalizeEvaluatorScoreTo100(10, "high-quality")).toBe(100);
  });

  it("does not inflate weak 1–10 scores", () => {
    expect(normalizeEvaluatorScoreTo100(9, "weak")).toBe(9);
  });

  it("maps 0–1 decimal to percent", () => {
    expect(normalizeEvaluatorScoreTo100(0.85)).toBe(85);
  });

  it("passes through real 0–100 scores", () => {
    expect(normalizeEvaluatorScoreTo100(87, "high-quality")).toBe(87);
    expect(normalizeEvaluatorScoreTo100(72)).toBe(72);
  });
});
