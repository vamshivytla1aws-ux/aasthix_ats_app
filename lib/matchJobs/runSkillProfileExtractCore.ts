/**
 * JD profile extraction + candidate matching.
 *
 * High-performance mode (default when AI on):
 *
 * MATCH_VECTOR_PIPELINE=1 (requires migration 0047 + pgvector + OPENAI_API_KEY):
 *   1) Job + candidate embeddings; SQL ORDER BY distance for retrieval
 *   2) Pair rerank (one chat) on top MATCH_PAIR_RERANK_TOP (default 40)
 *   3) Narrative LLM only for top MATCH_STAGE2_NARRATIVE_TOP (default 8)
 *   4) Others: embedding_rank or pair_rerank breakdown (no full narrative)
 *
 * Otherwise (legacy):
 *   1) quickScore (no OpenAI) for everyone
 *   2) take top QUICK_FILTER_AI_TOP_N (default 15)
 *   3) batch AI (5 per call) on that pool only
 *   4) merge + shortlist top QUICK_FILTER_SHORTLIST_TOP (default 10)
 *
 * MATCH_AI_DISABLED=1: full rule-based path for all (unchanged).
 */
import { query } from "@/lib/db";
import { extractJobSkillProfile, profileToCommaLists } from "@/lib/jdSkillExtraction";
import { computeRuleBasedMatchScore, type MatchBreakdown } from "@/lib/candidateJobMatchScore";
import { evaluationToAiMatchResult } from "@/lib/aiMatcher/evaluationToAiMatchResult";
import type { AiMatchResult } from "@/lib/matchScoreAi";
import { resolveCandidateResumeTextForMatch } from "@/lib/candidateResumeForMatch";
import { fitTierFromScore, shortlistTopCandidates } from "@/lib/shortlistService";
import { evaluateBatch, type BatchCandidateOut } from "@/lib/aiMatcher/batchEvaluate";
import { chunkCandidates } from "@/lib/matchJobs/batchProcessor";
import { quickScore } from "@/lib/matchJobs/quickScore";
import type { AiEvaluationResult } from "@/lib/aiMatcher/evaluateCandidate";
import { runVectorEnhancedMatch } from "@/lib/matchJobs/vectorEnhancedMatch";

function isPgCode(e: unknown, code: string) {
  return Boolean(e && typeof e === "object" && "code" in e && (e as { code?: string }).code === code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchCandidatesForMatch(userId: number) {
  let cols = [
    "id",
    "skills",
    "full_name",
    "email",
    "location",
    "notice_period",
    "resume_url",
    "resume_text",
    "experience_summary",
    "skillset",
  ];
  const requiredCols = ["id", "skills", "full_name", "email", "location"];
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const sql = `SELECT ${cols.join(", ")} FROM candidates WHERE created_by_user_id = $1`;
      const res = await query(sql, [userId]);
      const rows = res.rows as Record<string, unknown>[];
      for (const r of rows) {
        if (r.resume_text === undefined) r.resume_text = null;
        if (r.skillset === undefined) r.skillset = null;
        if (r.experience_summary === undefined) r.experience_summary = null;
        if (r.notice_period === undefined) r.notice_period = null;
        if (r.resume_url === undefined) r.resume_url = null;
      }
      return { ...res, rows };
    } catch (e) {
      if (!isPgCode(e, "42703")) throw e;
      const msg = String(e && typeof e === "object" && "message" in e ? (e as Error).message : "");
      const m = msg.match(/column "([^"]+)" does not exist/i);
      const missing = m?.[1]?.toLowerCase();
      if (!missing) throw e;
      const next = cols.filter((c) => c.toLowerCase() !== missing);
      if (!requiredCols.every((c) => next.includes(c))) throw e;
      cols = next;
    }
  }
  throw new Error("Could not load candidates: too many missing columns");
}

export type RunSkillProfileExtractOptions = {
  jobId: number;
  userId: number;
  runId?: number;
  bullmqJobId?: string | number;
  onProgress?: (completed: number, total: number) => void | Promise<void>;
};

function batchOutToAiEvaluation(b: BatchCandidateOut, name?: string): AiEvaluationResult {
  return {
    candidate_name: String(name || "Unknown").trim() || "Unknown",
    match_score: b.match_score,
    decision: b.decision,
    strengths: [],
    gaps: [],
    risks: [],
    summary: b.summary || "—",
  };
}

function buildAiOnlyBreakdown(score: number, ai: AiMatchResult, row: { full_name: string }): MatchBreakdown {
  return {
    version: 2,
    rule_score: score,
    ai_score: ai.match_score,
    hybrid_score: score,
    hybrid_weights: { rule: 0, ai: 1 },
    skills_component: score,
    experience_component: score,
    title_component: score,
    location_component: score,
    bonus_component: score,
    must_total: 0,
    must_matched: 0,
    nice_total: 0,
    nice_matched: 0,
    keyword_hits: 0,
    penalties: [],
    summary: ai.recruiter_summary ? [ai.recruiter_summary] : [],
    ai_matched_skills: ai.matched_skills,
    ai_missing_skills: ai.missing_skills,
    ai_reasoning: ai.reasoning,
    ai_recruiter_decision: ai.recruiter_decision,
    ai_candidate_name: ai.candidate_name ?? row.full_name,
    scoring_mode: "ai_primary",
    ai_fit_tier: fitTierFromScore(score),
    job_experience_label: null,
    candidate_years_estimated: null,
  };
}

/** No full rule engine — headline = quickScore only. */
function buildQuickFilterBreakdown(score: number, row: { full_name: string }): MatchBreakdown {
  return {
    version: 2,
    rule_score: score,
    ai_score: null,
    hybrid_score: score,
    hybrid_weights: { rule: 1, ai: 0 },
    skills_component: score,
    experience_component: score,
    title_component: score,
    location_component: score,
    bonus_component: score,
    must_total: 0,
    must_matched: 0,
    nice_total: 0,
    nice_matched: 0,
    keyword_hits: 0,
    penalties: [],
    summary: [`Quick filter (${score}). Not sent to AI — outside top pre-filter pool.`],
    scoring_mode: "quick_filter",
    ai_fit_tier: fitTierFromScore(score),
    job_experience_label: null,
    candidate_years_estimated: null,
  };
}

export async function runSkillProfileExtractCore(opts: RunSkillProfileExtractOptions): Promise<{
  candidatesScored: number;
  profile: {
    must_have: unknown[];
    nice_to_have: unknown[];
    keywords: unknown[];
    mode: string;
  };
  aiMatchDisabled: boolean;
}> {
  const { jobId, userId, runId, onProgress } = opts;

  const jobRes = await query(
    `SELECT id, title, description, location, employment_type, experience_requirement
     FROM jobs
     WHERE id = $1 AND created_by_user_id = $2
     LIMIT 1`,
    [jobId, userId]
  );
  if (jobRes.rowCount === 0) throw new Error("Job not found");
  const job = jobRes.rows[0] as {
    title: string;
    description: string | null;
    location: string | null;
    employment_type: string | null;
    experience_requirement: string | null;
  };

  const profile = await extractJobSkillProfile({
    title: job.title || "",
    description: job.description || "",
    employmentType: job.employment_type || "",
  });
  const lists = profileToCommaLists(profile);

  await query(
    `INSERT INTO job_skill_profiles (job_id, must_have_skills, nice_to_have_skills, role_keywords, extraction_mode, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (job_id) DO UPDATE SET
       must_have_skills = EXCLUDED.must_have_skills,
       nice_to_have_skills = EXCLUDED.nice_to_have_skills,
       role_keywords = EXCLUDED.role_keywords,
       extraction_mode = EXCLUDED.extraction_mode,
       updated_at = NOW()`,
    [jobId, lists.must || null, lists.nice || null, lists.keywords || null, profile.mode]
  );

  const candRes = await fetchCandidatesForMatch(userId);

  const appRes = await query(
    `SELECT candidate_id, stage FROM applications WHERE job_id = $1 AND created_by_user_id = $2`,
    [jobId, userId]
  );
  const appMap = new Map<number, string>();
  for (const r of appRes.rows as { candidate_id: number; stage: string }[]) {
    appMap.set(r.candidate_id, r.stage);
  }

  const rows = candRes.rows as Array<{
    id: number;
    skills: string | null;
    full_name: string;
    location: string | null;
    resume_url: string | null;
    resume_text: string | null;
    experience_summary: string | null;
    skillset: string[] | null;
  }>;

  const matchAiDisabled = process.env.MATCH_AI_DISABLED === "1";
  const jdText = `${job.title}\n${job.description || ""}`;

  const aiPoolN = Math.min(100, Math.max(0, Number(process.env.QUICK_FILTER_AI_TOP_N ?? 15)));
  const shortlistN = Math.min(50, Math.max(1, Number(process.env.QUICK_FILTER_SHORTLIST_TOP ?? 10)));
  const batchDelayMs = Math.min(30_000, Math.max(0, Number(process.env.MATCH_BATCH_DELAY_MS ?? 0)));

  const resumeCache = new Map<string, Promise<string>>();
  const total = rows.length;
  let done = 0;

  async function setItemStatus(candidateId: number, status: string, err?: string | null) {
    if (runId == null) return;
    try {
      await query(
        `INSERT INTO ai_match_job_items (run_id, candidate_id, status, error, attempts, updated_at)
         VALUES ($1, $2, $3, $4, 1, NOW())
         ON CONFLICT (run_id, candidate_id) DO UPDATE SET
           status = EXCLUDED.status,
           error = COALESCE(EXCLUDED.error, ai_match_job_items.error),
           attempts = ai_match_job_items.attempts + 1,
           updated_at = NOW()`,
        [runId, candidateId, status, err ?? null]
      );
    } catch {
      /* optional table */
    }
  }

  async function bumpRunRow(failed: boolean) {
    if (runId == null) return;
    try {
      await query(
        `UPDATE ai_match_job_runs SET
           completed_count = completed_count + 1,
           failed_count = failed_count + $2,
           updated_at = NOW()
         WHERE id = $1`,
        [runId, failed ? 1 : 0]
      );
    } catch {
      /* optional */
    }
  }

  type Prepared = {
    row: (typeof rows)[0];
    ai: AiMatchResult | null;
    score: number;
    breakdown: MatchBreakdown;
    displayMatched: string | null;
    displayMissing: string | null;
  };

  const prepared: Prepared[] = [];

  if (matchAiDisabled) {
    for (const row of rows) {
      const rule = computeRuleBasedMatchScore({
        profile,
        candidateSkillsRaw: row.skills,
        candidateLocation: row.location,
        jobLocation: job.location,
        jobTitle: job.title,
        experienceRequirement: job.experience_requirement,
      });
      const score = rule.score;
      const breakdown: MatchBreakdown = {
        ...rule.breakdown,
        hybrid_score: score,
        rule_score: rule.breakdown.rule_score,
        ai_score: null,
        scoring_mode: "rule_only",
        ai_fit_tier: fitTierFromScore(score),
      };
      prepared.push({
        row,
        ai: null,
        score,
        breakdown,
        displayMatched: rule.matched.join(", ") || null,
        displayMissing: rule.missingMust.join(", ") || null,
      });
    }
    if (runId != null && rows.length > 0) {
      for (const row of rows) {
        await setItemStatus(row.id, "COMPLETED");
        await bumpRunRow(false);
      }
      done = rows.length;
      await onProgress?.(done, total);
    }
  } else {
    const useVector = process.env.MATCH_VECTOR_PIPELINE === "1";
    let vectorOk = false;
    if (useVector) {
      try {
        const vp = await runVectorEnhancedMatch({
          jobId,
          userId,
          runId,
          jdText,
          rows,
          resumeCache,
          onProgress,
          setItemStatus,
          bumpRunRow,
        });
        for (const p of vp) {
          prepared.push({
            row: p.row,
            ai: p.ai,
            score: p.score,
            breakdown: p.breakdown,
            displayMatched: p.displayMatched,
            displayMissing: p.displayMissing,
          });
        }
        vectorOk = vp.length > 0;
      } catch (e) {
        console.warn("MATCH_VECTOR_PIPELINE unavailable, using quickScore + batch path:", e);
      }
    }

    if (!vectorOk) {
    // --- Step 1: quick score everyone (no OpenAI, no file IO) ---
    const scored = rows.map((row) => ({
      row,
      q: quickScore(jdText, {
        skills: row.skills,
        experience_summary: row.experience_summary,
        resume_text: row.resume_text,
        skillset: row.skillset,
        full_name: row.full_name,
        location: row.location,
      }),
    }));
    scored.sort((a, b) => b.q - a.q);

    const aiPoolRows = aiPoolN > 0 ? scored.slice(0, aiPoolN).map((s) => s.row) : [];
    const aiPoolSet = new Set(aiPoolRows.map((r) => r.id));
    const quickById = new Map(scored.map((s) => [s.row.id, s.q]));

    // --- Step 2: quick-only rows (not in AI pool) ---
    for (const { row, q } of scored) {
      if (aiPoolSet.has(row.id)) continue;
      const breakdown = buildQuickFilterBreakdown(q, row);
      prepared.push({
        row,
        ai: null,
        score: q,
        breakdown,
        displayMatched: row.skills?.slice(0, 200) || "—",
        displayMissing: null,
      });
      await setItemStatus(row.id, "COMPLETED");
      await bumpRunRow(false);
      done++;
      await onProgress?.(done, total);
    }

    // --- Step 3: resolve resumes + AI batches for pool only ---
    const resolved: Array<{ row: (typeof rows)[0]; resumeText: string; quick: number }> = [];
    for (const row of aiPoolRows) {
      const resumeText = await resolveCandidateResumeTextForMatch(row, resumeCache);
      resolved.push({ row, resumeText, quick: quickById.get(row.id) ?? 0 });
    }

    const batches = chunkCandidates(resolved, 5);

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx]!;
      for (const { row } of batch) {
        await setItemStatus(row.id, "PROCESSING");
      }

      const batchIn = batch.map(({ row, resumeText }) => ({
        id: row.id,
        resumeText,
        name: row.full_name,
      }));

      let outs: BatchCandidateOut[] = [];
      try {
        outs = await evaluateBatch(jdText, batchIn);
      } catch (e) {
        console.error("evaluateBatch failed", e);
        outs = batchIn.map((b) => ({
          id: String(b.id),
          match_score: 60,
          decision: "Hold",
        }));
      }

      for (let i = 0; i < batch.length; i++) {
        const { row } = batch[i]!;
        const b = outs[i] ?? { id: String(row.id), match_score: 60, decision: "Hold" };
        const ev = batchOutToAiEvaluation(b, row.full_name);
        const ai = evaluationToAiMatchResult(row.id, ev);
        const score = ai.match_score;
        const breakdown = buildAiOnlyBreakdown(score, ai, row);
        prepared.push({
          row,
          ai,
          score,
          breakdown,
          displayMatched: ai.matched_skills.length ? ai.matched_skills.join(", ") : null,
          displayMissing: ai.missing_skills.length ? ai.missing_skills.join(", ") : null,
        });
        await setItemStatus(row.id, "COMPLETED");
        await bumpRunRow(false);
        done++;
        await onProgress?.(done, total);
      }

      if (batchIdx < batches.length - 1 && batchDelayMs > 0) {
        await sleep(batchDelayMs);
      }
    }
    }
  }

  const shortlistMin = Number(process.env.MATCH_SHORTLIST_MIN_SCORE ?? "");
  const shortlistOpts =
    Number.isFinite(shortlistMin) && shortlistMin >= 0 && shortlistMin <= 100
      ? { minScore: shortlistMin }
      : undefined;

  const forShortlist = prepared.map((p) => ({
    id: String(p.row.id),
    name: p.row.full_name,
    match_score: p.score,
    decision: p.ai?.recruiter_decision ?? "—",
  }));
  const rankedMeta = shortlistTopCandidates(forShortlist, shortlistN, shortlistOpts);
  const metaById = new Map(rankedMeta.map((r) => [r.id, { rank: r.rank, shortlisted: r.shortlisted }]));

  let computed = 0;
  for (const { row, score, breakdown, displayMatched, displayMissing } of prepared) {
    const meta = metaById.get(String(row.id));
    if (meta) {
      breakdown.ai_match_rank = meta.rank;
      breakdown.ai_shortlisted = meta.shortlisted;
    }

    const stage = appMap.get(row.id);
    await query(
      `INSERT INTO candidate_job_matches (
         job_id, candidate_id, match_score, matched_skills, missing_must_have,
         match_breakdown, already_applied, application_stage, computed_at
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW())
       ON CONFLICT (job_id, candidate_id) DO UPDATE SET
         match_score = EXCLUDED.match_score,
         matched_skills = EXCLUDED.matched_skills,
         missing_must_have = EXCLUDED.missing_must_have,
         match_breakdown = EXCLUDED.match_breakdown,
         already_applied = EXCLUDED.already_applied,
         application_stage = EXCLUDED.application_stage,
         computed_at = NOW()`,
      [
        jobId,
        row.id,
        score,
        displayMatched,
        displayMissing,
        JSON.stringify(breakdown),
        Boolean(stage),
        stage ?? null,
      ]
    );
    computed += 1;
  }

  if (runId != null) {
    try {
      await query(`UPDATE ai_match_job_runs SET status = 'completed', updated_at = NOW() WHERE id = $1`, [runId]);
    } catch {
      /* optional */
    }
  }

  return {
    candidatesScored: computed,
    profile: {
      must_have: profile.must_have,
      nice_to_have: profile.nice_to_have,
      keywords: profile.keywords,
      mode: profile.mode,
    },
    aiMatchDisabled: matchAiDisabled,
  };
}
