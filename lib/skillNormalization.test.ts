import { describe, expect, it } from "vitest";
import {
  canonicalSkillKey,
  candidateHasSkill,
  parseCandidateSkillsNormalized,
  semanticSkillRepresentative,
} from "@/lib/skillNormalization";

describe("canonicalSkillKey", () => {
  it("aliases js and react variants", () => {
    expect(canonicalSkillKey("JS")).toBe("javascript");
    expect(canonicalSkillKey("reactjs")).toBe("react");
    expect(canonicalSkillKey("Node")).toBe("node.js");
  });
});

describe("parseCandidateSkillsNormalized", () => {
  it("dedupes aliases", () => {
    const s = parseCandidateSkillsNormalized("JavaScript, js, React, react.js");
    expect(s.has("javascript")).toBe(true);
    expect(s.has("react")).toBe(true);
    expect(s.size).toBe(2);
  });
});

describe("candidateHasSkill", () => {
  it("matches canonical equality", () => {
    const c = parseCandidateSkillsNormalized("TypeScript, React");
    expect(candidateHasSkill(c, "typescript")).toBe(true);
    expect(candidateHasSkill(c, "angular")).toBe(false);
  });

  it("treats marketing analytics as data analysis cluster", () => {
    const c = parseCandidateSkillsNormalized("Marketing Analytics, SQL, Tableau");
    expect(semanticSkillRepresentative("marketing analytics")).toBe(
      semanticSkillRepresentative("data analysis")
    );
    expect(candidateHasSkill(c, "data analysis")).toBe(true);
  });
});
