import { describe, expect, it } from "vitest";
import { fitTierFromScore, shortlistTopCandidates } from "@/lib/shortlistService";

describe("shortlistTopCandidates", () => {
  it("sorts desc, ranks globally, flags top N", () => {
    const r = shortlistTopCandidates(
      [
        { id: "a", name: "A", match_score: 50, decision: "Hold" },
        { id: "b", name: "B", match_score: 90, decision: "Proceed" },
        { id: "c", name: "C", match_score: 70, decision: "Hold" },
      ],
      2
    );
    expect(r.map((x) => x.id)).toEqual(["b", "c", "a"]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3]);
    expect(r.map((x) => x.shortlisted)).toEqual([true, true, false]);
  });

  it("optional minScore gates shortlist pool", () => {
    const r = shortlistTopCandidates(
      [
        { id: "a", name: "A", match_score: 95, decision: "P" },
        { id: "b", name: "B", match_score: 72, decision: "H" },
        { id: "c", name: "C", match_score: 68, decision: "R" },
      ],
      10,
      { minScore: 70 }
    );
    const top = r.filter((x) => x.shortlisted);
    expect(top.map((x) => x.id)).toEqual(["a", "b"]);
    expect(r.find((x) => x.id === "c")?.shortlisted).toBe(false);
  });
});

describe("fitTierFromScore", () => {
  it("maps tiers", () => {
    expect(fitTierFromScore(85)).toBe("Strong Fit");
    expect(fitTierFromScore(70)).toBe("Potential");
    expect(fitTierFromScore(64)).toBe("Low Fit");
  });
});
