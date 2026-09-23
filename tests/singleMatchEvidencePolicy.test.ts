import { describe, expect, it } from "vitest";
import { auditRequirements, decideEvidence, locateEvidence, mergedExperienceMonths } from "@/lib/singleMatch/evidencePolicy";
import type { Finding, Requirement } from "@/lib/singleMatch/evidencePolicy";

const req: Requirement = { id: "r1", label: "Dynamics implementation", category: "mandatory", jd_quote: "Dynamics implementation required", critical: true, production_required: true, alternatives: [], minimum_months: null };
const finding = (depth: Finding["depth"], quote = "Implemented Dynamics in production"): Finding => ({ requirement_id: "r1", depth, quotes: depth === "absent" ? [] : [quote], explanation: "Evidence assessment", periods: [], question: "Describe your implementation." });
const domains = ["Dynamics", "Salesforce", "SAP", "ServiceNow", "Java", "React", "DevOps", "Data engineering", "QA", "Recruiting"];
describe("synthetic policy matrix (not recruiter-adjudicated accuracy)", () => {
  for (const domain of domains) for (const depth of ["production", "training", "claim", "absent", "contradiction", "explicit_mismatch"] as const) {
    it(`${domain}: ${depth}`, () => {
      const r = { ...req, label: `${domain} implementation` };
      const quote = `Evidence about ${domain}`;
      const result = decideEvidence(auditRequirements([r], [finding(depth, quote)], quote));
      expect(result.decision === "Send to interview").toBe(depth === "production");
      if (depth === "training" || depth === "claim") expect(result.score).toBeLessThanOrEqual(49);
    });
  }
});
describe("evidence integrity and arithmetic", () => {
  it("does not credit fabricated citations", () => {
    const rows = auditRequirements([req], [finding("production")], "Basic CRM coursework");
    expect(rows[0].credit).toBe(0);
    expect(decideEvidence(rows).decision).toBe("Clarification required");
  });
  it("requires exactly one evaluation per requirement", () => {
    expect(decideEvidence(auditRequirements([req], [], "resume")).decision).toBe("Clarification required");
    expect(auditRequirements([req], [finding("production"), finding("production")], "Implemented Dynamics in production")[0].credit).toBe(0);
  });
  it("redistributes absent categories without evidence-quality bonus", () => {
    expect(decideEvidence(auditRequirements([req], [finding("production")], "Implemented Dynamics in production")).score).toBe(100);
  });
  it("preserves alternatives as one credited requirement", () => {
    const r = { ...req, label: "AWS or Azure", alternatives: ["AWS", "Azure"] };
    expect(decideEvidence(auditRequirements([r], [finding("production", "Built on Azure")], "Built on Azure")).score).toBe(100);
  });
  it("preferences do not impose domain caps", () => {
    const preferred = { ...req, id: "p", category: "preferences" as const, critical: false };
    const absent = { ...finding("absent"), requirement_id: "p" };
    const result = decideEvidence(auditRequirements([req, preferred], [finding("production"), absent], "Implemented Dynamics in production"));
    expect(result.score).toBe(91);
    expect(result.decision).toBe("Send to interview");
  });
  it("does not double count overlapping employment", () => {
    expect(mergedExperienceMonths([{ start: "2020-01", end: "2022-01", quote: "dates" }, { start: "2021-01", end: "2023-01", quote: "dates" }])).toBe(36);
  });
  it("rejects invented dates despite a real quote", () => {
    const f = { ...finding("production"), periods: [{ start: "2020-01", end: "2024-01", quote: "Implemented Dynamics in production" }] };
    expect(auditRequirements([{ ...req, minimum_months: 24 }], [f], f.quotes[0])[0].credit).toBe(0);
  });
  it("supports date citations and relevant elapsed experience", () => {
    const quote = "Implemented Dynamics January 2020 - January 2023";
    const f = { ...finding("production", quote), periods: [{ start: "2020-01", end: "2023-01", quote }] };
    expect(auditRequirements([{ ...req, minimum_months: 24 }], [f], quote)[0].relevant_months).toBe(36);
  });
  it("leaves unknown years unresolved instead of using total career years", () => {
    expect(decideEvidence(auditRequirements([{ ...req, minimum_months: 24 }], [finding("production")], "Implemented Dynamics in production")).decision).toBe("Clarification required");
  });
  it("returns exact source positions", () => expect(locateEvidence("prefix evidence suffix", "evidence")).toEqual({ quote: "evidence", start: 7, end: 15 }));
  it("does not score logistics", () => expect(decideEvidence(auditRequirements([{ ...req, category: "logistics", critical: false }], [finding("production")], "Implemented Dynamics in production")).score).toBeNull());
});
