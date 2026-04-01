import { describe, expect, it } from "vitest";
import { extractMinYearsFromJd, parseJdPrefilter } from "@/lib/noAiMatch/jdPrefilter";

describe("no-ai jd prefilter", () => {
  it("extracts min years", () => {
    expect(extractMinYearsFromJd("We need 5+ years of experience in backend.")).toBe(5);
    expect(extractMinYearsFromJd("no numbers here")).toBeNull();
  });

  it("parses skill tokens", () => {
    const p = parseJdPrefilter("Senior React Developer", "Must have: react, typescript, node.js. Nice: graphql.");
    expect(p.jd_skill_tokens.length).toBeGreaterThan(0);
  });
});
