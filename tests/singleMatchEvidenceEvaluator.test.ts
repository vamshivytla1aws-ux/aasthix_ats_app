import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
const { request, source } = vi.hoisted(() => ({ request: vi.fn(), source: vi.fn() }));
vi.mock("@/lib/openaiChat", () => ({ fetchOpenAiChatJson: request }));
vi.mock("@/lib/singleMatch/verifiedSource", () => ({ loadVerifiedMatchResume: source, contentHash: (s: string) => createHash("sha256").update(s).digest("hex") }));
vi.mock("@/lib/ai/modelConfig", () => ({ getAiModelConfig: () => ({ resumeMatchModel: "configured-test-model" }) }));
import { runEvidenceMatch } from "@/lib/singleMatch/evidenceEvaluator";
const requirement = { id: "r1", label: "Platform delivery", category: "mandatory", jd_quote: "Platform delivery required", critical: true, production_required: true, alternatives: [], minimum_months: null };
const finding = { requirement_id: "r1", depth: "production", quotes: ["Delivered the platform in production."], explanation: "Delivered a project.", periods: [], question: "" };
const response = (value: unknown) => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
let serial = 0;
beforeEach(() => {
  request.mockReset(); source.mockReset(); serial++;
  source.mockResolvedValue({ text: "Delivered the platform in production.", fileHash: "hash", parserVersion: "test", pages: 1 });
});
describe("full source to immutable evaluation payload", () => {
  it.each([
    { finish_reason: "length", message: { content: "{}" } },
    { finish_reason: "stop", message: { content: "not JSON" } },
    { finish_reason: "stop", message: { content: "{}", refusal: "Refused" } },
  ])("does not score incomplete, malformed or refused output: %j", async choice => {
    request.mockResolvedValueOnce({ choices: [choice] });
    const result = await runEvidenceMatch(1, `Platform delivery required invalid ${serial}`);
    expect(result.match_score).toBeNull();
    expect(result.evidence_evaluation?.status).toBe("scoring_unavailable");
  });
  it("returns no score for unavailable resume without spending on AI", async () => {
    source.mockResolvedValue({ text: "", fileHash: "", parserVersion: "test", pages: 0, error: "Upload resume" });
    const result = await runEvidenceMatch(1, `Platform delivery required ${serial}`);
    expect(result.match_score).toBeNull(); expect(result.decision).toBe("Full resume required"); expect(request).not.toHaveBeenCalled();
  });
  it("fails closed on provider outage", async () => {
    request.mockRejectedValue(new Error("timeout"));
    const result = await runEvidenceMatch(1, `Platform delivery required ${serial}`);
    expect(result.match_score).toBeNull(); expect(result.decision).toBe("Scoring unavailable");
  });
  it("uses one scoring authority with provenance", async () => {
    request.mockResolvedValueOnce(response({ complete: true, requirements: [requirement] })).mockResolvedValueOnce(response({ complete: true, findings: [finding] }));
    const result = await runEvidenceMatch(1, `Platform delivery required ${serial}`);
    expect(result.match_score).toBe(100); expect(result.decision).toBe("Send to interview");
    expect(result.evidence_evaluation?.requirements[0].evidence[0].start).toBe(0);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("a failed review cannot turn uncertain evidence into a rejection", async () => {
    request.mockResolvedValueOnce(response({ complete: true, requirements: [requirement] })).mockResolvedValueOnce(response({ complete: true, findings: [{ ...finding, depth: "training" }] })).mockRejectedValueOnce(new Error("review failed"));
    const result = await runEvidenceMatch(1, `Platform delivery required ${serial}`);
    expect(result.decision).toBe("Clarification required"); expect(result.match_score).toBeLessThanOrEqual(49);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("never assigns a final score for incomplete coverage", async () => {
    request.mockResolvedValueOnce(response({ complete: true, requirements: [requirement] })).mockResolvedValueOnce(response({ complete: false, findings: [] }));
    expect((await runEvidenceMatch(1, `Platform delivery required ${serial}`)).match_score).toBeNull();
  });
  it("does not silently truncate over-budget sources", async () => {
    source.mockResolvedValue({ text: "x".repeat(96001), fileHash: "hash", parserVersion: "test", pages: 100 });
    expect((await runEvidenceMatch(1, "Platform delivery required")).evidence_evaluation?.status).toBe("coverage_incomplete");
    expect(request).not.toHaveBeenCalled();
  });
  it("covers late evidence in long resumes and does not reuse the final score", async () => {
    const jd = `Platform delivery required long ${serial}`;
    source.mockResolvedValue({ text: "Earlier employment. ".repeat(950) + finding.quotes[0], fileHash: "longhash", parserVersion: "test", pages: 8 });
    request.mockResolvedValueOnce(response({ complete: true, requirements: [requirement] }))
      .mockResolvedValueOnce(response({ complete: true, findings: [{ ...finding, depth: "absent", quotes: [] }] }))
      .mockResolvedValueOnce(response({ complete: true, findings: [finding] }));
    const result = await runEvidenceMatch(1, jd);
    expect(result.match_score).toBe(100);
    expect(result.evidence_evaluation?.coverage.processed_characters).toBe(result.evidence_evaluation?.coverage.resume_characters);
    request.mockResolvedValueOnce(response({ complete: true, findings: [{ ...finding, depth: "absent", quotes: [] }] }))
      .mockResolvedValueOnce(response({ complete: true, findings: [finding] }));
    await runEvidenceMatch(1, jd);
    expect(request).toHaveBeenCalledTimes(5);
  });
  it("limits an unresolved citation repair to one review", async () => {
    const invalid = { ...finding, quotes: ["Invented implementation"] };
    request.mockResolvedValueOnce(response({ complete: true, requirements: [requirement] }))
      .mockResolvedValueOnce(response({ complete: true, findings: [invalid] }))
      .mockResolvedValueOnce(response({ complete: true, findings: [invalid] }));
    const result = await runEvidenceMatch(1, `Platform delivery required citation ${serial}`);
    expect(result.decision).toBe("Clarification required");
    expect(result.evidence_evaluation?.requirements[0].credit).toBe(0);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("never exceeds eight requests for the largest supported resume with review", async () => {
    source.mockResolvedValue({ text: ("Basic platform coursework. ".repeat(4000)).slice(0, 96000), fileHash: "largehash", parserVersion: "test", pages: 30 });
    const training = { ...finding, depth: "training", quotes: ["Basic platform coursework."] };
    request.mockResolvedValueOnce(response({ complete: true, requirements: [requirement] }));
    for (let i = 0; i < 7; i++) request.mockResolvedValueOnce(response({ complete: true, findings: [training] }));
    const result = await runEvidenceMatch(1, `Platform delivery required budget ${serial}`);
    expect(request).toHaveBeenCalledTimes(8);
    expect(result.evidence_evaluation?.coverage.processed_characters).toBe(96000);
    expect(result.decision).not.toBe("Send to interview");
  });
});
