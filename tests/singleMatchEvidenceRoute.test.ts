import { beforeEach, expect, it, vi } from "vitest";
const { auth, query, run, save } = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn(), run: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ requirePermission: auth }));
vi.mock("@/lib/db", () => ({ query }));
vi.mock("@/lib/singleMatch/singleMatchService", () => ({ runSingleMatchCheck: run }));
vi.mock("@/lib/singleMatch/singleMatchHistoryDb", () => ({ insertSingleMatchHistory: save }));
import { POST } from "@/app/api/jobs/[id]/single-match-check/route";
const request = () => new Request("http://localhost/api/jobs/10/single-match-check", { method: "POST", body: JSON.stringify({ candidateId: 20, useAI: true }) });
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ ok: true, access: { user_id: 30 } });
  query.mockResolvedValue({ rows: [{ exists: 1 }] });
  run.mockResolvedValue({ result: { match_score: null, decision: "Full resume required" }, timings: {} });
  save.mockResolvedValue({ id: 1 });
});
it("denies unauthorized matching before accessing a resume", async () => {
  auth.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
  expect((await POST(request(), { params: { id: "10" } })).status).toBe(403);
  expect(query).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
});
it("denies records outside the caller scope", async () => {
  query.mockResolvedValue({ rows: [] });
  expect((await POST(request(), { params: { id: "10" } })).status).toBe(404);
  expect(query.mock.calls[0][0]).toContain("scope_user");
  expect(query.mock.calls[0][1]).toEqual([10, 20, 30]);
  expect(run).not.toHaveBeenCalled();
});
it("recomputes only the selected pair and inserts a new run each time", async () => {
  for (let i = 0; i < 2; i++) {
    const response = await POST(request(), { params: { id: "10" } });
    expect((await response.json()).result.match_score).toBeNull();
  }
  expect(run).toHaveBeenCalledTimes(2);
  expect(run).toHaveBeenCalledWith({ jobId: 10, candidateId: 20, useAI: true });
  expect(save).toHaveBeenCalledTimes(2);
});
