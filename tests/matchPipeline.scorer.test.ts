import { describe, it, expect } from "vitest";
import { weightedMatchScore, reconcileOverallPercentage } from "@/lib/matchPipeline/scorer";

describe("matchPipeline scorer", () => {
  it("computes weighted match from category scores", () => {
    const c = {
      domain_relevance: 90,
      core_skills: 85,
      business_impact: 88,
      stakeholder_management: 82,
      advanced_analytics: 60,
      tools_tech: 80,
      experience: 78,
    };
    const w = weightedMatchScore(c);
    expect(w).toBe(
      Math.round(
        0.25 * 90 +
          0.2 * 85 +
          0.15 * 88 +
          0.15 * 82 +
          0.1 * 60 +
          0.1 * 80 +
          0.05 * 78
      )
    );
  });

  it("reconcile prefers weighted sum when categories complete", () => {
    const categories = {
      domain_relevance: 50,
      core_skills: 50,
      business_impact: 50,
      stakeholder_management: 50,
      advanced_analytics: 50,
      tools_tech: 50,
      experience: 50,
    };
    expect(reconcileOverallPercentage(99, categories)).toBe(50);
  });
});
