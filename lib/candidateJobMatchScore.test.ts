import { describe, expect, it } from "vitest";
import { computeRuleBasedMatchScore } from "@/lib/candidateJobMatchScore";
import type { ExtractedSkillProfile } from "@/lib/jdSkillExtraction";

describe("computeRuleBasedMatchScore", () => {
  it("scores high when must-haves satisfied", () => {
    const profile: ExtractedSkillProfile = {
      must_have: ["react", "javascript", "node.js"],
      nice_to_have: ["typescript"],
      keywords: ["frontend"],
      mode: "RULE_BASED",
    };
    const r = computeRuleBasedMatchScore({
      profile,
      candidateSkillsRaw: "React, JavaScript, Node.js, TypeScript",
      jobTitle: "Senior React Developer",
      experienceRequirement: "4-6 years",
      candidateLocation: "Bangalore",
      jobLocation: "Bangalore, India",
    });
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.missingMust.length).toBe(0);
  });

  it("scores low when must-haves missing", () => {
    const profile: ExtractedSkillProfile = {
      must_have: ["python", "django", "postgresql"],
      nice_to_have: [],
      keywords: [],
      mode: "RULE_BASED",
    };
    const r = computeRuleBasedMatchScore({
      profile,
      candidateSkillsRaw: "Java, Spring only",
      jobTitle: "Python backend engineer",
      experienceRequirement: "5+ years",
    });
    expect(r.score).toBeLessThan(55);
    expect(r.missingMust.length).toBeGreaterThan(0);
  });
});
