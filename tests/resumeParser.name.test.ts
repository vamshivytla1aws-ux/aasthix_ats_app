import { describe, expect, it } from "vitest";
import {
  extractNameFromFilename,
  looksLikePersonName,
} from "@/lib/resumeParser";

describe("looksLikePersonName", () => {
  it("accepts typical names", () => {
    expect(looksLikePersonName("Hari Mohan")).toBe(true);
    expect(looksLikePersonName("Jane Mary Smith")).toBe(true);
  });

  it("rejects section headers and PDF garbage", () => {
    expect(looksLikePersonName("Prof Essional Overview")).toBe(false);
    expect(looksLikePersonName("Professional Summary")).toBe(false);
    expect(looksLikePersonName("Senior Engineer")).toBe(false);
  });
});

describe("extractNameFromFilename", () => {
  it("parses name before first underscore", () => {
    expect(extractNameFromFilename("Hari Mohan_Sr AI_Backend Engg.pdf")).toBe("Hari Mohan");
  });
});
