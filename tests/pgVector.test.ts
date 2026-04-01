import { describe, expect, it } from "vitest";
import { scoreFromCosineDistance, toPgVectorLiteral } from "@/lib/embeddings/pgVector";

describe("pgVector helpers", () => {
  it("maps cosine distance 0 to 100", () => {
    expect(scoreFromCosineDistance(0)).toBe(100);
  });

  it("maps cosine distance 2 to 0", () => {
    expect(scoreFromCosineDistance(2)).toBe(0);
  });

  it("formats vector literal", () => {
    expect(toPgVectorLiteral([0, 0.5, 1])).toBe("[0,0.5,1]");
  });
});
