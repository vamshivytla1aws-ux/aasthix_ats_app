/**
 * One job × one candidate evaluation. Does not read or write candidate_job_matches.
 *
 * - useAI=true: **pure OpenAI** full JD ↔ resume scoring (`scoreCandidatesBatchWithOpenAI`), no Python matcher.
 * - useAI=false: rule-based local matcher only.
 */
import { query } from "@/lib/db";
import { resolveCandidateResumeTextForMatch } from "@/lib/candidateResumeForMatch";
import { extractSkillsRuleBased } from "@/lib/jdSkillExtraction";
import { scoreCandidatesBatchWithOpenAI } from "@/lib/matchScoreAi";
import { runLocalNoAiMatcher, validateLocalResults } from "@/lib/noAiMatch/localMatcher";
import type { SingleMatchCheckResultPayload } from "@/lib/singleMatch/types";

type JobRow = {
  id: number;
  title: string;
  description: string | null;
  experience_requirement: string | null;
  must_have_skills: string | null;
  nice_to_have_skills: string | null;
  role_keywords: string | null;
};

type CandidateDbRow = {
  id: number;
  skills: string | null;
  resume_text: string | null;
  experience_summary: string | null;
  location: string | null;
  full_name: string;
};

function commaListSkills(s: string | null): string[] {
  return (s || "")
    .split(/[,;\n]/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 40);
}

function buildSkillHintsForAi(jobRow: JobRow, jd: string): {
  mustHave: string[];
  niceToHave: string[];
  keywords: string[];
} {
  const rule = extractSkillsRuleBased(jobRow.title, jd);
  const mustProfile = commaListSkills(jobRow.must_have_skills);
  const niceProfile = commaListSkills(jobRow.nice_to_have_skills);
  const kwRaw = (jobRow.role_keywords || "").trim();
  const kwList = kwRaw
    ? kwRaw
        .split(/[,;]/)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 24)
    : [...rule.keywords];

  return {
    mustHave: mustProfile.length > 0 ? mustProfile : [...rule.must_have].slice(0, 40),
    niceToHave: niceProfile.length > 0 ? niceProfile : [...rule.nice_to_have].slice(0, 32),
    keywords: kwList.slice(0, 24),
  };
}

function shortRecruiterDecision(d: "Proceed to Interview" | "Hold" | "Reject" | undefined): string | null {
  if (!d) return null;
  if (d === "Proceed to Interview") return "Proceed";
  return d;
}

export async function runSingleMatchCheck(opts: {
  jobId: number;
  candidateId: number;
  useAI: boolean;
}): Promise<{ result: SingleMatchCheckResultPayload }> {
  const { jobId, candidateId, useAI } = opts;
  if (!Number.isFinite(jobId) || jobId <= 0) {
    throw Object.assign(new Error("Invalid job id"), { statusCode: 400 });
  }
  if (!Number.isFinite(candidateId) || candidateId <= 0) {
    throw Object.assign(new Error("Invalid candidate id"), { statusCode: 400 });
  }

  const jobRes = await query(
    `
    SELECT
      j.id,
      j.title,
      j.description,
      j.experience_requirement,
      p.must_have_skills,
      p.nice_to_have_skills,
      p.role_keywords
    FROM jobs j
    LEFT JOIN job_skill_profiles p ON p.job_id = j.id
    WHERE j.id = $1
    LIMIT 1
    `,
    [jobId]
  );
  const jobRow = jobRes.rows[0] as JobRow | undefined;
  if (!jobRow) {
    throw Object.assign(new Error("Job not found"), { statusCode: 404 });
  }

  const jd = (jobRow.description || "").trim();
  if (!jd) {
    throw Object.assign(new Error("Job description is empty — add a JD before running a match check"), {
      statusCode: 400,
    });
  }

  const candRes = await query(
    `
    SELECT
      c.id,
      c.skills,
      c.resume_text,
      c.experience_summary,
      c.location,
      c.full_name
    FROM candidates c
    WHERE c.id = $1
    LIMIT 1
    `,
    [candidateId]
  );
  const candRow = candRes.rows[0] as CandidateDbRow | undefined;
  if (!candRow) {
    throw Object.assign(new Error("Candidate not found"), { statusCode: 404 });
  }

  const resumeCache = new Map<string, Promise<string>>();
  const resume = await resolveCandidateResumeTextForMatch(
    {
      id: candRow.id,
      full_name: candRow.full_name,
      skills: candRow.skills,
      location: candRow.location,
      resume_text: candRow.resume_text,
      experience_summary: candRow.experience_summary,
    },
    resumeCache
  );

  if (useAI) {
    if (!process.env.OPENAI_API_KEY) {
      throw Object.assign(new Error("OPENAI_API_KEY is not set — required for AI match check"), {
        statusCode: 503,
      });
    }

    const hints = buildSkillHintsForAi(jobRow, jd);
    const aiMap = await scoreCandidatesBatchWithOpenAI({
      jobTitle: jobRow.title.trim(),
      jobDescriptionExcerpt: jd,
      experienceRequirement: jobRow.experience_requirement?.trim() || null,
      mustHave: hints.mustHave,
      niceToHave: hints.niceToHave,
      keywords: hints.keywords,
      candidates: [
        {
          id: candidateId,
          full_name: candRow.full_name,
          skills: candRow.skills,
          location: candRow.location,
          resumeText: resume || null,
        },
      ],
    });

    if (!aiMap || !aiMap.has(candidateId)) {
      throw Object.assign(
        new Error("OpenAI scoring failed or returned no result for this candidate — try again or check logs"),
        { statusCode: 502 }
      );
    }

    const ai = aiMap.get(candidateId)!;
    const score = Math.round(ai.match_score);
    const decisionShort = shortRecruiterDecision(ai.recruiter_decision);
    const matched = [...ai.matched_skills];
    const missing = [...ai.missing_skills];
    const summaryParts = [`${score}% · full JD ↔ resume AI`, `${matched.length} strengths cited`];
    if (missing.length) summaryParts.push(`${missing.length} gaps`);

    const result: SingleMatchCheckResultPayload = {
      match_score: score,
      match_score_no_ai: null,
      ai_match_score: score,
      decision: decisionShort,
      decision_no_ai: null,
      ai_decision: decisionShort,
      matched_skills: matched,
      missing_required_skills: missing,
      reasoning: ai.reasoning?.trim() || null,
      summary: ai.recruiter_summary?.trim() || summaryParts.join(" · "),
    };
    return { result };
  }

  const local = await runLocalNoAiMatcher({
    jd,
    candidates: [{ id: String(candidateId), resume: resume || "" }],
  });
  const resultMap = validateLocalResults(local.all_results);
  const hit = resultMap.get(String(candidateId));
  if (!hit) {
    throw Object.assign(new Error("No-AI matcher returned no result for this candidate"), { statusCode: 502 });
  }

  const match_score_no_ai = Math.round(hit.match_score);
  const decision_no_ai = hit.decision || null;
  const matched_skills = [...(hit.matched_required_skills ?? [])];
  const missing_required_skills = [...(hit.missing_required_skills ?? [])];
  const summary = [
    `No-AI score ${match_score_no_ai}%`,
    `${matched_skills.length} required skills matched`,
    missing_required_skills.length ? `${missing_required_skills.length} gaps` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const result: SingleMatchCheckResultPayload = {
    match_score: match_score_no_ai,
    match_score_no_ai,
    ai_match_score: null,
    decision: decision_no_ai,
    decision_no_ai,
    ai_decision: null,
    matched_skills,
    missing_required_skills,
    reasoning: null,
    summary,
  };

  return { result };
}
