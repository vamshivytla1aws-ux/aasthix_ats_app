import { describe, it, expect } from "vitest";
import { rankCandidates } from "@/lib/rankCandidates";

describe("rankCandidates", () => {
  it("sorts by match_score desc and assigns rank", () => {
    const r = rankCandidates([
      { candidate_id: 1, name: "A", match_score: 70, decision: "Hold", summary: "x" },
      { candidate_id: 2, name: "B", match_score: 90, decision: "Proceed to Interview", summary: "y" },
    ]);
    expect(r[0].candidate_id).toBe(2);
    expect(r[0].rank).toBe(1);
    expect(r[1].rank).toBe(2);
  });
});
