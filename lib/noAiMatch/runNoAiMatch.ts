import { query } from "@/lib/db";
import { parseJdPrefilter } from "@/lib/noAiMatch/jdPrefilter";
import {
  PYTHON_MAX,
  fetchCandidatePayloadRows,
  prefilterCandidateIdsForJob,
} from "@/lib/noAiMatch/prefilterCandidates";
import { callPythonNoAiMatcher, validatePythonResults, type PythonMatchRow } from "@/lib/noAiMatch/pythonMatcherClient";
import { resolveCandidateResumeTextForMatch } from "@/lib/candidateResumeForMatch";

export type NoAiCandidateRow = {
  candidateId: string;
  match_score_no_ai: number | null;
  hire_probability: number | null;
  decision_no_ai: string | null;
  no_ai_rank: number | null;
  matched_required_skills: string[];
  missing_required_skills: string[];
  exact_required_coverage: number | null;
  title_match: number | null;
  domain_match: boolean | null;
  qualification_gate_failed: boolean | null;
};

export type NoAiMatchResult = {
  success: true;
  jobId: number;
  processed: number;
  top_10: PythonMatchRow[];
  candidates: NoAiCandidateRow[];
  meta: { matcher_ms: number; pool_total: number; prefilter: boolean };
};

async function getCandidatePoolIds(jobId: number): Promise<number[]> {
  const m = await query(
    `SELECT candidate_id FROM candidate_job_matches WHERE job_id = $1`,
    [jobId]
  );
  const fromMatches = (m.rows as { candidate_id: number }[]).map((r) => Number(r.candidate_id));
  if (fromMatches.length > 0) return fromMatches;

  const all = await query(
    `SELECT id FROM candidates ORDER BY created_at DESC NULLS LAST, id DESC LIMIT 2000`
  );
  return (all.rows as { id: number }[]).map((r) => Number(r.id));
}

function computeNoAiRanks(allResults: PythonMatchRow[]): Map<string, number> {
  const sorted = [...allResults].sort((a, b) => {
    const ds = (b.match_score ?? 0) - (a.match_score ?? 0);
    if (ds !== 0) return ds;
    return String(a.id).localeCompare(String(b.id));
  });
  return new Map(sorted.map((r, i) => [String(r.id), i + 1]));
}

export async function runNoAiMatchForJob(jobId: number): Promise<NoAiMatchResult> {
  const jobRes = await query(
    `SELECT id, title, description FROM jobs WHERE id = $1 LIMIT 1`,
    [jobId]
  );
  if (jobRes.rowCount === 0) {
    throw Object.assign(new Error("Job not found"), { statusCode: 404 });
  }
  const job = jobRes.rows[0] as { id: number; title: string; description: string | null };
  const jd = (job.description || "").trim();
  if (!jd) {
    throw Object.assign(new Error("Job description is empty"), { statusCode: 400 });
  }

  const poolIds = await getCandidatePoolIds(jobId);
  if (poolIds.length === 0) {
    throw Object.assign(new Error("No candidates to score"), { statusCode: 400 });
  }

  const signals = parseJdPrefilter(job.title, job.description);
  const { ids: filteredIds, usedPrefilter, poolTotal } = await prefilterCandidateIdsForJob({
    signals,
    poolIds,
  });

  const rows = await fetchCandidatePayloadRows(filteredIds);
  const resumeCache = new Map<string, Promise<string>>();
  const candidates: { id: string; resume: string }[] = [];
  for (const row of rows) {
    const resume = await resolveCandidateResumeTextForMatch(
      {
        id: row.id,
        full_name: row.full_name,
        skills: row.skills,
        location: null,
        resume_text: row.resume_text,
      },
      resumeCache
    );
    candidates.push({
      id: String(row.id),
      resume: resume || "",
    });
  }

  const py = await callPythonNoAiMatcher({ jd, candidates });
  if (!py.ok) {
    const isTimeout = py.status === 504;
    const isUnavailable = py.status === 503;
    const msg = isTimeout
      ? "Matcher timed out"
      : isUnavailable
        ? py.body
        : `Matcher error (${py.status}): ${py.body.slice(0, 500)}`;
    const code = isTimeout ? 504 : isUnavailable ? 503 : 502;
    throw Object.assign(new Error(msg), { statusCode: code });
  }

  const matcherMs = py.data.meta?.latency_ms ?? 0;
  const resultMap = validatePythonResults(py.data.all_results);
  const rankById = computeNoAiRanks(py.data.all_results);
  const top10 = [...py.data.top_10].slice(0, 10).map((r) => resultMap.get(String(r.id)) ?? r);

  const outRows: NoAiCandidateRow[] = [];
  for (const c of candidates) {
    const hit = resultMap.get(c.id);
    const rank = rankById.get(c.id) ?? null;
    outRows.push({
      candidateId: c.id,
      match_score_no_ai: hit?.match_score ?? null,
      hire_probability: hit?.hire_probability ?? null,
      decision_no_ai: hit?.decision ?? null,
      no_ai_rank: rank,
      matched_required_skills: hit?.matched_required_skills ?? [],
      missing_required_skills: hit?.missing_required_skills ?? [],
      exact_required_coverage: hit?.exact_required_coverage ?? null,
      title_match: hit?.title_match ?? null,
      domain_match: hit?.domain_match ?? null,
      qualification_gate_failed: hit?.qualification_gate_failed ?? null,
    });
  }

  await persistNoAiScores(jobId, outRows);

  return {
    success: true,
    jobId,
    processed: candidates.length,
    top_10: top10,
    candidates: outRows,
    meta: { matcher_ms: matcherMs, pool_total: poolTotal, prefilter: usedPrefilter },
  };
}

async function persistNoAiScores(jobId: number, rows: NoAiCandidateRow[]): Promise<void> {
  const ids = rows.map((r) => Number(r.candidateId)).filter((n) => Number.isFinite(n));
  if (ids.length === 0) return;

  await query(
    `
    INSERT INTO candidate_job_matches (
      job_id, candidate_id, match_score, matched_skills, missing_must_have,
      match_breakdown, already_applied, application_stage, computed_at
    )
    SELECT $1, c.id, 0, NULL, NULL, '{}'::jsonb, false, NULL, NOW()
    FROM candidates c
    WHERE c.id = ANY($2::bigint[])
    ON CONFLICT (job_id, candidate_id) DO NOTHING
    `,
    [jobId, ids]
  );

  const ms = rows.map((r) => (r.match_score_no_ai == null ? null : Math.round(r.match_score_no_ai)));
  const hp = rows.map((r) => (r.hire_probability == null ? null : Math.round(r.hire_probability)));
  const dec = rows.map((r) => r.decision_no_ai);
  const ranks = rows.map((r) => r.no_ai_rank);

  try {
    await query(
      `
      UPDATE candidate_job_matches AS m
      SET
        match_score_no_ai = v.match_score_no_ai,
        hire_probability = v.hire_probability,
        decision_no_ai = v.decision_no_ai,
        no_ai_rank = v.no_ai_rank,
        computed_no_ai_at = NOW()
      FROM UNNEST($2::bigint[], $3::int[], $4::int[], $5::text[], $6::int[])
        AS v(candidate_id, match_score_no_ai, hire_probability, decision_no_ai, no_ai_rank)
      WHERE m.job_id = $1 AND m.candidate_id = v.candidate_id
      `,
      [jobId, ids, ms, hp, dec, ranks]
    );
  } catch (e: unknown) {
    const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined;
    if (code === "42703") {
      await query(
        `
        UPDATE candidate_job_matches AS m
        SET
          match_score_no_ai = v.match_score_no_ai,
          hire_probability = v.hire_probability,
          decision_no_ai = v.decision_no_ai,
          computed_no_ai_at = NOW()
        FROM UNNEST($2::bigint[], $3::int[], $4::int[], $5::text[])
          AS v(candidate_id, match_score_no_ai, hire_probability, decision_no_ai)
        WHERE m.job_id = $1 AND m.candidate_id = v.candidate_id
        `,
        [jobId, ids, ms, hp, dec]
      );
      return;
    }
    throw e;
  }
}

export { PYTHON_MAX };
