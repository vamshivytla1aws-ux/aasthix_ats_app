/**
 * pgvector retrieval → pair rerank (1 chat) → narrative batches for top N only.
 * Falls back by throwing if prerequisites are missing (caller uses quickScore path).
 */
import { query } from "@/lib/db";
import { createEmbeddingsBatch } from "@/lib/embeddings/openaiEmbeddings";
import { toPgVectorLiteral, scoreFromCosineDistance } from "@/lib/embeddings/pgVector";
import { getOrCreateJobEmbedding } from "@/lib/matchJobs/jobEmbeddingCache";
import { pairRerankScores, type PairRerankIn } from "@/lib/matchJobs/pairRerank";
import { resolveCandidateResumeTextForMatch } from "@/lib/candidateResumeForMatch";
import { quickScore } from "@/lib/matchJobs/quickScore";
import { chunkCandidates } from "@/lib/matchJobs/batchProcessor";
import { evaluateBatchNarrative, type NarrativeBatchRow } from "@/lib/aiMatcher/batchEvaluateNarrative";
import type { AiMatchResult } from "@/lib/matchScoreAi";
import type { MatchBreakdown } from "@/lib/candidateJobMatchScore";
import { fitTierFromScore } from "@/lib/shortlistService";

export type CandidateRowForMatch = {
  id: number;
  skills: string | null;
  full_name: string;
  location: string | null;
  resume_url: string | null;
  resume_text: string | null;
  experience_summary: string | null;
  skillset: string[] | null;
};

export type VectorMatchPrepared = {
  row: CandidateRowForMatch;
  ai: AiMatchResult | null;
  score: number;
  breakdown: MatchBreakdown;
  displayMatched: string | null;
  displayMissing: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function pgvectorReady(): Promise<boolean> {
  try {
    const r = await query(`SELECT 1 FROM pg_extension WHERE extname = 'vector' LIMIT 1`);
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

async function candidatesHaveEmbeddingColumn(): Promise<boolean> {
  try {
    const r = await query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'candidates' AND column_name = 'resume_embedding'
       LIMIT 1`
    );
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

function buildAiPrimaryFromNarrative(
  score: number,
  ai: AiMatchResult,
  row: { full_name: string }
): MatchBreakdown {
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
    ai_decision_reason: ai.decision_reason,
    ai_recruiter_summary: ai.recruiter_summary,
    scoring_mode: "ai_primary",
    ai_fit_tier: fitTierFromScore(score),
    job_experience_label: null,
    candidate_years_estimated: null,
  };
}

function buildEmbeddingRankBreakdown(score: number, row: { full_name: string }): MatchBreakdown {
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
    summary: [
      `Embedding similarity rank (${score}). Pair rerank covers the top slice by vector distance; full LLM narrative runs only for the global top pool.`,
    ],
    scoring_mode: "embedding_rank",
    ai_fit_tier: fitTierFromScore(score),
    job_experience_label: null,
    candidate_years_estimated: null,
  };
}

function buildPairRerankBreakdown(score: number, row: { full_name: string }): MatchBreakdown {
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
    summary: [`Pairwise JD↔snippet rerank (${score}). Semantic narrative not generated for this row (outside top narrative pool).`],
    scoring_mode: "pair_rerank",
    ai_fit_tier: fitTierFromScore(score),
    job_experience_label: null,
    candidate_years_estimated: null,
  };
}

function normalizeDecision(d: string): "Proceed to Interview" | "Hold" | "Reject" | undefined {
  const s = d.toLowerCase();
  if (s.includes("reject")) return "Reject";
  if (s.includes("hold")) return "Hold";
  if (s.includes("proceed") || s.includes("interview")) return "Proceed to Interview";
  return undefined;
}

function narrativeRowToAiMatch(candidateId: number, row: NarrativeBatchRow, name: string): AiMatchResult {
  return {
    candidate_id: candidateId,
    match_score: row.match_score,
    matched_skills: row.matched_skills,
    missing_skills: row.missing_skills,
    reasoning: row.decision_reason || row.recruiter_summary || "—",
    candidate_name: name,
    decision_reason: row.decision_reason,
    recruiter_summary: row.recruiter_summary,
    strengths: row.strengths,
    gaps: row.gaps,
    recruiter_decision: normalizeDecision(String(row.decision || "")),
  };
}

async function updateRunPreview(runId: number | undefined, data: unknown) {
  if (runId == null) return;
  try {
    await query(`UPDATE ai_match_job_runs SET embedding_preview_json = $2::jsonb, updated_at = NOW() WHERE id = $1`, [
      runId,
      JSON.stringify(data),
    ]);
  } catch {
    /* optional column */
  }
}

export async function runVectorEnhancedMatch(opts: {
  jobId: number;
  userId: number;
  runId?: number;
  jdText: string;
  rows: CandidateRowForMatch[];
  resumeCache: Map<string, Promise<string>>;
  onProgress?: (completed: number, total: number) => void | Promise<void>;
  setItemStatus: (candidateId: number, status: string, err?: string | null) => Promise<void>;
  bumpRunRow: (failed: boolean) => Promise<void>;
}): Promise<VectorMatchPrepared[]> {
  const { jobId, userId, runId, jdText, rows, resumeCache, onProgress, setItemStatus, bumpRunRow } = opts;

  if (!(await pgvectorReady()) || !(await candidatesHaveEmbeddingColumn())) {
    throw new Error("pgvector pipeline unavailable");
  }

  const pairRerankTop = Math.min(80, Math.max(10, Number(process.env.MATCH_PAIR_RERANK_TOP || 40)));
  const narrativeTop = Math.min(20, Math.max(1, Number(process.env.MATCH_STAGE2_NARRATIVE_TOP || 8)));
  const batchDelayMs = Math.min(30_000, Math.max(0, Number(process.env.MATCH_BATCH_DELAY_MS ?? 0)));

  const total = rows.length;
  let done = 0;

  const rowById = new Map(rows.map((r) => [r.id, r]));
  const jobVec = await getOrCreateJobEmbedding(jobId, jdText);
  const jdLiteral = toPgVectorLiteral(jobVec);

  /** Ensure every candidate has a stored embedding. */
  const needEmbed: CandidateRowForMatch[] = [];
  const embCheck = await query(
    `SELECT id, resume_embedding IS NOT NULL AS has_emb FROM candidates WHERE created_by_user_id = $1 AND id = ANY($2::int[])`,
    [userId, rows.map((r) => r.id)]
  );
  const hasEmb = new Map((embCheck.rows as { id: number; has_emb: boolean }[]).map((x) => [x.id, x.has_emb]));
  for (const r of rows) {
    if (!hasEmb.get(r.id)) needEmbed.push(r);
  }

  if (needEmbed.length > 0) {
    const texts = await Promise.all(needEmbed.map((r) => resolveCandidateResumeTextForMatch(r, resumeCache)));
    const vectors = await createEmbeddingsBatch(texts);
    const model = process.env.MATCH_EMBEDDING_MODEL || "text-embedding-3-small";
    for (let i = 0; i < needEmbed.length; i++) {
      const r = needEmbed[i]!;
      const lit = toPgVectorLiteral(vectors[i]!);
      await query(
        `UPDATE candidates SET
           resume_embedding = $1::vector,
           resume_embedding_updated_at = NOW(),
           resume_embedding_model = $2
         WHERE id = $3 AND created_by_user_id = $4`,
        [lit, model, r.id, userId]
      );
    }
  }

  const distRes = await query(
    `SELECT id, (resume_embedding <=> $1::vector) AS dist
     FROM candidates
     WHERE created_by_user_id = $2 AND resume_embedding IS NOT NULL AND id = ANY($3::int[])`,
    [jdLiteral, userId, rows.map((r) => r.id)]
  );
  const distById = new Map<number, number>();
  for (const d of distRes.rows as { id: number; dist: string | number }[]) {
    distById.set(Number(d.id), Number(d.dist));
  }

  const quickById = new Map<number, number>();
  for (const r of rows) {
    quickById.set(
      r.id,
      quickScore(jdText, {
        skills: r.skills,
        experience_summary: r.experience_summary,
        resume_text: r.resume_text,
        skillset: r.skillset,
        full_name: r.full_name,
        location: r.location,
      })
    );
  }

  const sortedByDist = [...rows]
    .filter((r) => distById.has(r.id))
    .sort((a, b) => (distById.get(a.id)! ?? 9) - (distById.get(b.id)! ?? 9));
  const rerankPool = sortedByDist.slice(0, pairRerankTop);

  await updateRunPreview(runId, {
    phase: "embedding",
    at: new Date().toISOString(),
    top_preview: sortedByDist.slice(0, 20).map((r) => ({
      id: r.id,
      name: r.full_name,
      score: scoreFromCosineDistance(distById.get(r.id) ?? 2),
    })),
  });

  const rerankInputs: PairRerankIn[] = [];
  for (const r of rerankPool) {
    const txt = await resolveCandidateResumeTextForMatch(r, resumeCache);
    rerankInputs.push({ id: r.id, name: r.full_name, snippet: txt.slice(0, 2_000) });
  }

  const rerankScores = await pairRerankScores(jdText, rerankInputs, pairRerankTop);

  await updateRunPreview(runId, {
    phase: "rerank",
    at: new Date().toISOString(),
    top_preview: [...rerankScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([id, score]) => ({
        id,
        name: rowById.get(id)?.full_name ?? "",
        score,
      })),
  });

  function finalScoreFor(id: number): number {
    if (rerankScores.has(id)) return rerankScores.get(id)!;
    const dist = distById.get(id);
    if (dist != null && Number.isFinite(dist)) return scoreFromCosineDistance(dist);
    return quickById.get(id) ?? 0;
  }

  const globalOrder = [...rows].sort((a, b) => finalScoreFor(b.id) - finalScoreFor(a.id));
  const narrativeIds = new Set(globalOrder.slice(0, narrativeTop).map((r) => r.id));

  const preparedMap = new Map<number, VectorMatchPrepared>();

  /** Non-narrative rows first (cheaper completions for progress bar). */
  for (const row of globalOrder) {
    if (narrativeIds.has(row.id)) continue;
    const score = finalScoreFor(row.id);
    const inRerank = rerankScores.has(row.id);
    const breakdown = inRerank ? buildPairRerankBreakdown(score, row) : buildEmbeddingRankBreakdown(score, row);
    preparedMap.set(row.id, {
      row,
      ai: null,
      score,
      breakdown,
      displayMatched: row.skills?.slice(0, 200) || "—",
      displayMissing: null,
    });
    await setItemStatus(row.id, "COMPLETED");
    await bumpRunRow(false);
    done++;
    await onProgress?.(done, total);
  }

  const narrativeRows = globalOrder.filter((r) => narrativeIds.has(r.id));
  const resolvedNarr = await Promise.all(
    narrativeRows.map(async (r) => ({
      row: r,
      resumeText: await resolveCandidateResumeTextForMatch(r, resumeCache),
    }))
  );

  const narrBatches = chunkCandidates(resolvedNarr, 5);
  for (let batchIdx = 0; batchIdx < narrBatches.length; batchIdx++) {
    const batch = narrBatches[batchIdx]!;
    for (const { row } of batch) {
      await setItemStatus(row.id, "PROCESSING");
    }

    const batchIn = batch.map(({ row, resumeText }) => ({
      id: row.id,
      resumeText,
      name: row.full_name,
    }));

    let outs: NarrativeBatchRow[] = [];
    try {
      outs = await evaluateBatchNarrative(jdText, batchIn);
    } catch (e) {
      console.error("evaluateBatchNarrative failed", e);
      outs = batchIn.map((b) => ({
        id: String(b.id),
        match_score: finalScoreFor(Number(b.id)),
        decision: "Hold",
        recruiter_summary: "—",
        decision_reason: "",
        matched_skills: [],
        missing_skills: [],
        strengths: [],
        gaps: [],
      }));
    }

    const byId = new Map(outs.map((o) => [o.id, o]));
    for (const { row } of batch) {
      const raw = byId.get(String(row.id));
      const nr =
        raw ??
        ({
          id: String(row.id),
          match_score: finalScoreFor(row.id),
          decision: "Hold",
          recruiter_summary: "—",
          decision_reason: "",
          matched_skills: [],
          missing_skills: [],
          strengths: [],
          gaps: [],
        } as NarrativeBatchRow);
      const ai = narrativeRowToAiMatch(row.id, nr, row.full_name);
      const score = nr.match_score;
      const breakdown = buildAiPrimaryFromNarrative(score, ai, row);
      preparedMap.set(row.id, {
        row,
        ai,
        score,
        breakdown,
        displayMatched: ai.matched_skills.length ? ai.matched_skills.join(", ") : row.skills?.slice(0, 200) || null,
        displayMissing: ai.missing_skills.length ? ai.missing_skills.join(", ") : null,
      });
      await setItemStatus(row.id, "COMPLETED");
      await bumpRunRow(false);
      done++;
      await onProgress?.(done, total);
    }

    if (batchIdx < narrBatches.length - 1 && batchDelayMs > 0) {
      await sleep(batchDelayMs);
    }
  }

  return globalOrder.map((r) => preparedMap.get(r.id)!).filter(Boolean);
}
