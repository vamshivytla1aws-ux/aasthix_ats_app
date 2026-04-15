import { describe, expect, it } from "vitest";
import { findIndiaLocationFallback, looksLikeCandidateLocation } from "@/lib/resumeParser";

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

  it("normalizes major India city aliases", () => {
    expect(findIndiaLocationFallback("Current location Bangalore")).toBe("Bengaluru, India");
    expect(findIndiaLocationFallback("Based in Gurgaon and open to relocate")).toBe("Gurugram, India");
    expect(findIndiaLocationFallback("Working from Bombay office")).toBe("Mumbai, India");
  });

  it("returns null when no confident India city match exists", () => {
    expect(findIndiaLocationFallback("Built dashboards from multiple data sources into Power BI")).toBe(null);
    expect(findIndiaLocationFallback("8 years of experience in Azure and SQL Server")).toBe(null);
  });
});
