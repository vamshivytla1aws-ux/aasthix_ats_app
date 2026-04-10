import { describe, expect, it } from "vitest";
import { looksLikeCandidateLocation } from "@/lib/resumeParser";

describe("looksLikeCandidateLocation", () => {
  it("accepts real city, country pairs", () => {
    expect(looksLikeCandidateLocation("Chennai, India")).toBe(true);
    expect(looksLikeCandidateLocation("Austin, TX")).toBe(true);
    expect(looksLikeCandidateLocation("Portland, OR")).toBe(true);
  });

  it("rejects tech skill pairs misread as locations", () => {
    expect(looksLikeCandidateLocation("EF Core, Node")).toBe(false);
    expect(looksLikeCandidateLocation("retrieval, ranking")).toBe(false);
  });

  it("rejects JD / experience fragments", () => {
    expect(looksLikeCandidateLocation("years of experience in Azur")).toBe(false);
    expect(looksLikeCandidateLocation("requirements. Proven leade")).toBe(false);
  });
});
