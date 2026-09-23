import { expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ query }));
import { insertSingleMatchHistory, listSingleMatchHistoryForJob } from "@/lib/singleMatch/singleMatchHistoryDb";
import type { SingleMatchCheckResultPayload } from "@/lib/singleMatch/types";

it("persists null scores and the complete evaluation without transforming history", async () => {
  const result: SingleMatchCheckResultPayload = {
    match_score: null, ai_match_score: null, match_score_no_ai: null, decision: "Full resume required", ai_decision: null, decision_no_ai: null,
    matched_skills: [], missing_required_skills: [], reasoning: "Upload full resume", summary: "Upload full resume",
    evidence_evaluation: { status: "full_resume_required", policy_version: "evidence-v3.1", prompt_version: "v1", model: "test",
      source: { resume_hash: "", jd_hash: "jd", parser_version: "v1", pages: 0 }, coverage: { resume_characters: 0, processed_characters: 0, jd_characters: 200, requirements: 0, evaluated_requirements: 0 },
      audit: { outcome: "not_scored", issues: [], review_used: false }, requirements: [], breakdown: [], reasons: ["Upload full resume"] },
  };
  query.mockResolvedValueOnce({ rows: [{ id: 1 }] });
  await insertSingleMatchHistory({ jobId: 1, candidateId: 2, createdByUserId: 3, useAi: true, result });
  const params = query.mock.calls[0][1];
  expect(params[4]).toBeNull();
  const advanced = JSON.parse(params[14]);
  expect(advanced.evidence_evaluation).toEqual(result.evidence_evaluation);
  query.mockResolvedValueOnce({ rows: [{ id: 1, job_id: 1, candidate_id: 2, match_score: null, advanced_insights_json: advanced }] });
  const history = await listSingleMatchHistoryForJob({ jobId: 1, ownerUserId: 3 });
  expect(history.runs[0].match_score).toBeNull();
  expect(history.runs[0].evidence_evaluation).toEqual(result.evidence_evaluation);
  expect(query.mock.calls[1][0]).toContain("scope_user");
  expect(query.mock.calls[1][1]).toEqual([1, 50, 3]);
});
