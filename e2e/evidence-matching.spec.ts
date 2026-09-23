import { expect, test } from "@playwright/test";
import type { SingleMatchCheckResultPayload, SingleMatchHistoryRun } from "../lib/singleMatch/types";

// Real browser UI against isolated API fixtures. No production data or paid AI calls.
for (const width of [1440, 768, 390]) {
  test(`Match Hub evidence/history/recompute and no-score states at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.addCookies([{ name: "ats_token", value: "mock-ui-test-only", url: "http://127.0.0.1:3000" }]);
    let history: SingleMatchHistoryRun[] = [];
    let requests = 0;
    const result: SingleMatchCheckResultPayload = {
      match_score: 25, match_score_no_ai: null, ai_match_score: 25,
      decision: "Do not shortlist on current evidence", ai_decision: "Do not shortlist on current evidence", decision_no_ai: null,
      matched_skills: [], missing_required_skills: ["Production implementation not demonstrated"], reasoning: "Only basic training is documented.", summary: "Only basic training is documented.",
      evidence_evaluation: {
        status: "evaluated", model: "mock-model", policy_version: "evidence-v3.1", prompt_version: "requirements-v1",
        source: { resume_hash: "a".repeat(64), jd_hash: "b".repeat(64), parser_version: "test", pages: 1 },
        coverage: { resume_characters: 1000, processed_characters: 1000, jd_characters: 100, requirements: 1, evaluated_requirements: 1 },
        audit: { outcome: "passed", issues: [], review_used: true }, breakdown: [{ category: "mandatory", awarded: 25, max: 100 }],
        reasons: ["Basic training only, without production evidence.", "Confirm platform implementation experience.", "Recruiter guidance; no stage changes."],
        requirements: [{ id: "r1", label: "Dynamics production implementation", category: "mandatory", critical: true, production_required: true,
          jd_quote: "Dynamics production implementation required", alternatives: [], minimum_months: null,
          requirement_id: "r1", depth: "training", quotes: ["Basic Dynamics coursework"], explanation: "Training only, not production delivery.",
          periods: [], question: "Which production implementation did you own?", evidence: [{ quote: "Basic Dynamics coursework", start: 0, end: 25 }], credit: 0.25, relevant_months: null, audit_issues: [] }],
      },
    };
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown = { items: [], members: [], users: [], approvals: [], questions: [], rounds: [], notifications: [], alerts: [], conversations: [] };
      if (path === "/api/auth/me") body = { user: { id: 1, full_name: "Test Recruiter", role: "workspace_owner" }, permissions: { "jobs.manage": true, "jobs.view": true, "candidates.view": true } };
      else if (path === "/api/jobs/10") body = { id: 10, title: "Dynamics Consultant", company: "Test", location: "Remote", status: "Open", description: "Dynamics production implementation required" };
      else if (path.endsWith("/stats")) body = { total_applications: 0, stage_counts: {} };
      else if (path.endsWith("/skill-matches")) body = { profile: null, matches: [] };
      else if (path.endsWith("/hiring-insights")) body = { migration_required: true };
      else if (path === "/api/candidates") body = [{ id: 20, full_name: "Sample Trainee", email: "trainee@example.test", location: "Remote" }];
      else if (path.endsWith("/single-match-check/history")) body = { runs: history };
      else if (path.endsWith("/single-match-check")) {
        expect(route.request().postDataJSON()).toEqual({ candidateId: 20, useAI: true });
        requests++;
        const current = requests !== 3 ? result : { ...result, match_score: null, ai_match_score: null, decision: "Full resume required", evidence_evaluation: {
          ...result.evidence_evaluation!, status: "full_resume_required", requirements: [], breakdown: [],
          audit: { outcome: "not_scored", issues: [], review_used: false },
          coverage: { resume_characters: 0, processed_characters: 0, jd_characters: 100, requirements: 0, evaluated_requirements: 0 },
          reasons: ["Please upload a complete resume."],
        } };
        if (requests !== 4) history = [{ ...current, id: requests, job_id: 10, candidate_id: 20, candidate_full_name: "Sample Trainee", use_ai: true, created_at: "2026-09-23T10:00:00Z" } as SingleMatchHistoryRun, ...history];
        body = { success: true, jobId: 10, candidateId: 20, result: current, history_saved: requests !== 4 };
      }
      await route.fulfill({ json: body });
    });
    await page.goto("/jobs/10");
    await page.getByRole("button", { name: "JD & resume matches", exact: true }).click();
    await page.getByRole("button", { name: "AI Matching", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "1-to-1 match check", exact: true });
    await dialog.getByPlaceholder("Type name, skill, or location (min 2 characters)").fill("Sample");
    await dialog.getByRole("button", { name: /Sample Trainee/ }).click();
    await dialog.getByRole("button", { name: "Run single match", exact: true }).click();
    const report = dialog.getByRole("region", { name: "Evidence-based match result" });
    await expect(report.getByRole("heading", { name: "Do not shortlist on current evidence", exact: true })).toBeVisible();
    await expect(report.getByText("25% evidence-based fit")).toBeVisible();
    await expect(report.locator("blockquote").filter({ hasText: "Basic Dynamics coursework" })).toBeVisible();
    await dialog.getByRole("button", { name: "View", exact: true }).first().click();
    await expect(report.getByText(/Saved evaluation:/)).toBeVisible();
    await dialog.getByRole("button", { name: "Recompute", exact: true }).first().click();
    await expect.poll(() => requests).toBe(2);
    await dialog.getByRole("button", { name: "Run single match", exact: true }).click();
    await expect(report.getByRole("heading", { name: "Full resume required" })).toBeVisible();
    await expect(report.getByText("No percentage assigned")).toBeVisible();
    await expect(report.getByText("Score arithmetic")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Run single match", exact: true }).click();
    await expect(report.getByText("25% evidence-based fit")).toBeVisible();
    await expect(dialog.getByText(/Evaluation completed but could not be saved/)).toBeVisible();
    await expect(report).toHaveCount(1);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: test.info().outputPath(`evidence-${width}.png`) });
  });
}
