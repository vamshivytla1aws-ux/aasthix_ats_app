/**
 * Production hybrid matching: No-AI Python bulk score → single AI call reranks top 10 only.
 */

import { query } from "@/lib/db";
import { buildCompactAiCandidateProfile } from "@/lib/candidateDerivedProfile";
import { buildCompactAiJobProfile, extractJobSkillProfile } from "@/lib/jdSkillExtraction";
import { buildTop10RerankPayload } from "@/lib/aiMatcher/buildTop10RerankPayload";
import { rerankTop10Candidates } from "@/lib/aiMatcher/rerankTop10Candidates";
import { runNoAiMatchForJob, type NoAiMatchResult } from "@/lib/noAiMatch/runNoAiMatch";
import { TOP10_RERANK_PROMPT_VERSION } from "@/lib/aiMatcher/top10RerankPrompt";
import { computeRuleBasedMatchScore } from "@/lib/candidateJobMatchScore";
import { evaluateCandidateSemantically } from "@/lib/semanticCandidateEvaluation";

export type HybridJobMatchResult = {
  success: true;
  jobId: number;
  noAi: NoAiMatchResult;
  aiRerank:
    | { ok: true; model: string; promptVersion: string; latencyMs: number }
    | { ok: false; reason: string };
  top10ForUi: Array<{
    candidate_id: number;
    match_score_no_ai: number | null;
    no_ai_rank: number | null;
    ai_rerank_rank: number | null;
    ai_rerank_score: number | null;
    ai_rerank_decision: string | null;
    ai_rerank_reason: string | null;
  }>;
};

async function clearAiRerankForJob(jobId: number): Promise<void> {
  try {
    await query(
      `
      UPDATE candidate_job_matches
      SET
        ai_rerank_score = NULL,
        ai_rerank_decision = NULL,
        ai_rerank_reason = NULL,
        ai_rerank_rank = NULL
      WHERE job_id = $1
      `,
      [jobId]
    );
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code !== "42703") throw e;
  }
}

async function persistAiRerankRows(
  jobId: number,
  rows: Array<{
    candidateId: number;
    ai_rerank_score: number;
    ai_rerank_decision: string;
    ai_rerank_reason: string;
    ai_rerank_rank: number;
  }>
): Promise<void> {
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.candidateId);
  const scores = rows.map((r) => r.ai_rerank_score);
  const decs = rows.map((r) => r.ai_rerank_decision);
  const reasons = rows.map((r) => r.ai_rerank_reason);
  const ranks = rows.map((r) => r.ai_rerank_rank);
  try {
    await query(
      `
      UPDATE candidate_job_matches AS m
      SET
        ai_rerank_score = v.ai_rerank_score,
        ai_rerank_decision = v.ai_rerank_decision,
        ai_rerank_reason = v.ai_rerank_reason,
        ai_rerank_rank = v.ai_rerank_rank
      FROM UNNEST($2::bigint[], $3::int[], $4::text[], $5::text[], $6::int[])
        AS v(candidate_id, ai_rerank_score, ai_rerank_decision, ai_rerank_reason, ai_rerank_rank)
      WHERE m.job_id = $1 AND m.candidate_id = v.candidate_id
      `,
      [jobId, ids, scores, decs, reasons, ranks]
    );
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code === "42703") return;
    throw e;
  }
}

async function insertRerankRunMeta(opts: {
  jobId: number;
  userId: number;
  totalCandidates: number;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  status: string;
}): Promise<number | null> {
  try {
    const res = await query(
      `
      INSERT INTO ai_match_job_runs (
        job_id,
        created_by_user_id,
        status,
        total_candidates,
        rerank_strategy,
        top_n,
        rerank_model,
        input_tokens,
        output_tokens,
        latency_ms,
        prompt_version
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
      `,
      [
        opts.jobId,
        opts.userId,
        opts.status,
        opts.totalCandidates,
        "top10_single_call",
        10,
        opts.model,
        opts.inputTokens,
        opts.outputTokens,
        opts.latencyMs,
        TOP10_RERANK_PROMPT_VERSION,
      ]
    );
    const id = (res.rows[0] as { id?: string } | undefined)?.id;
    return id != null ? Number(id) : null;
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code === "42703" || code === "42P01") return null;
    console.warn("insertRerankRunMeta", e);
    return null;
  }
}

/**
 * Optional pgvector prefilter is handled inside `runNoAiMatchForJob` via PostgreSQL overlap only
 * (see prefilterCandidates). No vector similarity is used as final rank.
 */
export async function runHybridJobMatch(jobId: number, userId: number): Promise<HybridJobMatchResult> {
  const noAi = await runNoAiMatchForJob(jobId);

  const emptyTop: HybridJobMatchResult["top10ForUi"] = [];

  if (noAi.top_10.length === 0 || !process.env.OPENAI_API_KEY) {
    const reason = !process.env.OPENAI_API_KEY ? "OPENAI_API_KEY not set" : "no candidates in top_10";
    await insertRerankRunMeta({
      jobId,
      userId,
      totalCandidates: noAi.processed,
      model: "none",
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
      status: "skipped",
    }).catch(() => null);
    return {
      success: true,
      jobId,
      noAi,
      aiRerank: { ok: false, reason },
      top10ForUi: emptyTop,
    };
  }

  const jobRes = await query(
    `
    SELECT j.id, j.title, j.description, j.experience_requirement,
           p.must_have_skills, p.nice_to_have_skills, p.role_keywords
    FROM jobs j
    LEFT JOIN job_skill_profiles p ON p.job_id = j.id
    WHERE j.id = $1
    LIMIT 1
    `,
    [jobId]
  );
  const jobRow = jobRes.rows[0] as
    | {
        id: number;
        title: string;
        description: string | null;
        experience_requirement: string | null;
        must_have_skills: string | null;
        nice_to_have_skills: string | null;
        role_keywords: string | null;
      }
    | undefined;

  if (!jobRow) {
    return {
      success: true,
      jobId,
      noAi,
      aiRerank: { ok: false, reason: "job row missing" },
      top10ForUi: emptyTop,
    };
  }

  const jobPayload = buildCompactAiJobProfile({
    job_id: jobId,
    title: jobRow.title,
    description: jobRow.description,
    experience_requirement: jobRow.experience_requirement,
    must_have_skills: jobRow.must_have_skills,
    nice_to_have_skills: jobRow.nice_to_have_skills,
    role_keywords: jobRow.role_keywords,
  });

  const topIds = noAi.top_10.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
  const candRes = await query(
    `
    SELECT
      c.id,
      c.skills,
      c.resume_text,
      c.experience_summary,
      c.location,
      c.normalized_skills,
      c.years_experience,
      c.domain_tags,
      c.normalized_title
    FROM candidates c
    WHERE c.id = ANY($1::bigint[])
    `,
    [topIds]
  );

  const byId = new Map(
    (candRes.rows as Array<Record<string, unknown>>).map((r) => [Number(r.id), r])
  );

  const noAiByCandidate = new Map(noAi.candidates.map((c) => [c.candidateId, c]));
  const compact: ReturnType<typeof buildCompactAiCandidateProfile>[] = [];

  for (const pyRow of noAi.top_10) {
    const id = Number(pyRow.id);
    const dbRow = byId.get(id);
    if (!dbRow) continue;
    const meta = noAiByCandidate.get(String(id));
    const rank = meta?.no_ai_rank ?? 1;
    compact.push(
      buildCompactAiCandidateProfile(
        dbRow as Parameters<typeof buildCompactAiCandidateProfile>[0],
        pyRow,
        rank
      )
    );
  }

  if (compact.length === 0) {
    return {
      success: true,
      jobId,
      noAi,
      aiRerank: { ok: false, reason: "no candidate rows for top_10" },
      top10ForUi: emptyTop,
    };
  }

  const payload = buildTop10RerankPayload({
    job: jobPayload,
    candidates: compact,
  });

  const expectedIds = compact.map((c) => c.candidate_id);
  const rer = await rerankTop10Candidates({
    payload,
    expectedCandidateIdsInOrder: expectedIds,
  });

  if (!rer.ok) {
    await insertRerankRunMeta({
      jobId,
      userId,
      totalCandidates: noAi.processed,
      model: "error",
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
      status: "failed",
    }).catch(() => null);
    return {
      success: true,
      jobId,
      noAi,
      aiRerank: { ok: false, reason: rer.error },
      top10ForUi: noAi.top_10.map((r, i) => ({
        candidate_id: Number(r.id),
        match_score_no_ai: r.match_score,
        no_ai_rank: noAiByCandidate.get(String(r.id))?.no_ai_rank ?? i + 1,
        ai_rerank_rank: null,
        ai_rerank_score: null,
        ai_rerank_decision: null,
        ai_rerank_reason: null,
      })),
    };
  }

  await clearAiRerankForJob(jobId);

  const persistRows = rer.rankedCandidates.map((r) => ({
    candidateId: Number(r.candidate_id),
    ai_rerank_score: r.ai_match_score,
    ai_rerank_decision: r.ai_decision,
    ai_rerank_reason: r.reasoning,
    ai_rerank_rank: r.final_rank,
  }));
  await persistAiRerankRows(jobId, persistRows);

  await insertRerankRunMeta({
    jobId,
    userId,
    totalCandidates: noAi.processed,
    model: rer.model,
    inputTokens: rer.usage.input_tokens ?? null,
    outputTokens: rer.usage.output_tokens ?? null,
    latencyMs: rer.latencyMs,
    status: "completed",
  }).catch(() => null);

  const top10ForUi = rer.rankedCandidates.map((r) => ({
    candidate_id: Number(r.candidate_id),
    match_score_no_ai: noAiByCandidate.get(r.candidate_id)?.match_score_no_ai ?? null,
    no_ai_rank: noAiByCandidate.get(r.candidate_id)?.no_ai_rank ?? null,
    ai_rerank_rank: r.final_rank,
    ai_rerank_score: r.ai_match_score,
    ai_rerank_decision: r.ai_decision,
    ai_rerank_reason: r.reasoning,
  }));

  return {
    success: true,
    jobId,
    noAi,
    aiRerank: {
      ok: true,
      model: rer.model,
      promptVersion: rer.promptVersion,
      latencyMs: rer.latencyMs,
    },
    top10ForUi,
  };
}

/* -------------------------------------------------------------------------- */
/* Legacy demo helper (kept for test-hybrid-system.ts) — not used in API.    */
/* -------------------------------------------------------------------------- */

interface HybridMatchResult {
  candidate_name: string;
  ats_score: number;
  semantic_score: number;
  hybrid_score: number;
  decision: "Proceed to Interview" | "Hold" | "Reject";
  decision_reason: string;
  domain_alignment: "aligned" | "partial" | "misaligned";
  recommendation: string;
  breakdown: {
    ats_components: unknown;
    semantic_components: unknown;
    weighting_used: {
      ats_weight: number;
      semantic_weight: number;
    };
  };
}

export async function computeHybridMatch(
  jobDescription: string,
  candidateResume: string,
  jobTitle: string = "Senior Role",
  experienceRequirement: string = "5+ years"
): Promise<HybridMatchResult> {
  const jobProfile = await extractJobSkillProfile({
    title: jobTitle,
    description: jobDescription,
    employmentType: "full-time",
  });

  const atsResult = computeRuleBasedMatchScore({
    profile: jobProfile,
    candidateSkillsRaw: candidateResume,
    candidateLocation: "Bangalore, India",
    jobLocation: "San Francisco, CA",
    jobTitle,
    experienceRequirement,
  });

  const semanticResult = await evaluateCandidateSemantically(jobDescription, candidateResume, jobTitle);

  let domainAlignment: "aligned" | "partial" | "misaligned" = "aligned";
  if (semanticResult.category_scores.domain_relevance >= 80) {
    domainAlignment = "aligned";
  } else if (semanticResult.category_scores.domain_relevance >= 60) {
    domainAlignment = "partial";
  } else {
    domainAlignment = "misaligned";
  }

  let atsWeight = 0.4;
  let semanticWeight = 0.6;
  if (domainAlignment === "aligned") {
    atsWeight = 0.3;
    semanticWeight = 0.7;
  } else if (domainAlignment === "misaligned") {
    atsWeight = 0.2;
    semanticWeight = 0.8;
  }

  const hybridScore = Math.round(
    atsResult.score * atsWeight + semanticResult.overall_match_percentage * semanticWeight
  );

  let decision: "Proceed to Interview" | "Hold" | "Reject";
  let decisionReason = "";
  let recommendation = "";

  if (hybridScore >= 80) {
    decision = "Proceed to Interview";
    decisionReason = "Strong candidate with excellent domain alignment and skills";
    recommendation = "Fast-track to final interview stage";
  } else if (hybridScore >= 65) {
    decision = "Hold";
    decisionReason = "Decent candidate with some gaps - consider for secondary review";
    recommendation = "Review specific gaps before proceeding";
  } else {
    decision = "Reject";
    decisionReason = "Insufficient alignment with key requirements";
    recommendation = "Not suitable for current role";
  }

  if (domainAlignment === "misaligned") {
    decision = "Reject";
    decisionReason = "Domain mismatch - candidate skills not aligned with role requirements";
    recommendation = "Consider roles in software engineering instead of marketing analytics";
  }

  return {
    candidate_name: semanticResult.candidate_name,
    ats_score: atsResult.score,
    semantic_score: semanticResult.overall_match_percentage,
    hybrid_score: hybridScore,
    decision,
    decision_reason: decisionReason,
    domain_alignment: domainAlignment,
    recommendation,
    breakdown: {
      ats_components: atsResult.breakdown,
      semantic_components: semanticResult.category_scores,
      weighting_used: {
        ats_weight: atsWeight,
        semantic_weight: semanticWeight,
      },
    },
  };
}

export async function testAdityaMatching(): Promise<void> {
  const marketingJD = `We are looking for a Senior Marketing Analytics Manager to lead our data-driven marketing initiatives.

REQUIREMENTS:
- 8+ years of experience in marketing analytics or campaign analysis
- Strong expertise in SQL, Tableau, and data visualization
- Experience with campaign analytics and customer journey analysis`;

  const softwareJD = `We are seeking a Senior Software Engineer to join our growing engineering team.

REQUIREMENTS:
- 8+ years of software development experience
- Strong proficiency in React, Node.js, and modern JavaScript frameworks
- Experience with cloud platforms (AWS, Azure, GCP)`;

  const adityaResume = `ADITYA PANDITA
Senior Software Engineer | Full Stack Developer | AWS Certified Solutions Architect

8+ years of experience building scalable web applications and leading development teams.
SKILLS: React, Node.js, Express.js, MongoDB, PostgreSQL, AWS, Docker, Kubernetes`;

  await computeHybridMatch(marketingJD, adityaResume, "Senior Marketing Analytics Manager");
  await computeHybridMatch(softwareJD, adityaResume, "Senior Software Engineer");
}

export type { HybridMatchResult };
