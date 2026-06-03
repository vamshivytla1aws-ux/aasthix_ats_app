/**
 * One job x one candidate evaluation. Does not read or write candidate_job_matches.
 *
 * - useAI=true: pure OpenAI full JD <-> resume scoring, enriched with recruiter-facing
 *   requirement breakdown, confidence, and follow-up guidance.
 * - useAI=false: rule-based local matcher only.
 */
import { query } from "@/lib/db";
import { resolveCandidateResumeForMatchDetailed } from "@/lib/candidateResumeForMatch";
import { refreshResumeEmbeddingForCandidate } from "@/lib/candidates/refreshResumeEmbedding";
import { extractSkillsRuleBased } from "@/lib/jdSkillExtraction";
import { scoreCandidatesBatchWithOpenAI } from "@/lib/matchScoreAi";
import { runLocalNoAiMatcher, validateLocalResults } from "@/lib/noAiMatch/localMatcher";
import { buildAdvancedPureAiInsights } from "@/lib/singleMatch/advancedPureAi";
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
  email: string | null;
  skills: string | null;
  skillset: string[] | null;
  created_by_user_id: number | null;
  resume_url: string | null;
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

function withResumeSourceWarning(
  text: string | null | undefined,
  source: "stored_resume_text" | "uploaded_resume_file" | "experience_summary_or_skills" | "none",
  recovery?: {
    attempted?: boolean;
    succeeded?: boolean;
    reason?: string | null;
  } | null
): string | null {
  const base = (text || "").trim();
  if (recovery?.attempted && !recovery.succeeded && source !== "uploaded_resume_file") {
    const warning = `Resume recovery note: scored from fallback profile text; percentage and gaps are not trustworthy until full resume recovery succeeds.${recovery.reason ? ` ${recovery.reason}` : ""}`;
    return base ? `${base}\n\n${warning}` : warning;
  }
  if (source === "experience_summary_or_skills") {
    const warning =
      "Confidence note: this score used fallback experience summary / skills text instead of a parsed uploaded resume, so gaps may reflect incomplete source material.";
    return base ? `${base}\n\n${warning}` : warning;
  }
  if (source === "none") {
    const warning =
      "Confidence note: no full resume text was available for scoring. Upload a resume file or save resume text for a reliable pure-AI match.";
    return base ? `${base}\n\n${warning}` : warning;
  }
  return base || null;
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
    throw Object.assign(new Error("Job description is empty - add a JD before running a match check"), {
      statusCode: 400,
    });
  }

  const candRes = await query(
    `
    SELECT
      c.id,
      c.email,
      c.skills,
      c.skillset,
      c.created_by_user_id,
      c.resume_url,
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
  const resolvedResume = await resolveCandidateResumeForMatchDetailed(
    {
      id: candRow.id,
      full_name: candRow.full_name,
      email: candRow.email,
      skills: candRow.skills,
      skillset: candRow.skillset,
      location: candRow.location,
      created_by_user_id: candRow.created_by_user_id,
      resume_url: candRow.resume_url,
      resume_text: candRow.resume_text,
      experience_summary: candRow.experience_summary,
    },
    resumeCache,
    { preferUploadedFile: true }
  );
  const resume = resolvedResume.text;
  const recovery = resolvedResume.recovery ?? null;

  if (
    recovery?.succeeded &&
    resolvedResume.source === "uploaded_resume_file" &&
    candRow.created_by_user_id != null &&
    (resolvedResume.resolvedResumeUrl && resolvedResume.resolvedResumeUrl !== candRow.resume_url ||
      !candRow.resume_text ||
      candRow.resume_text.trim().length < 100)
  ) {
    try {
      await query(
        `
        UPDATE candidates
        SET
          resume_url = COALESCE($2, resume_url),
          resume_text = $3,
          updated_at = NOW()
        WHERE id = $1
        `,
        [candidateId, resolvedResume.resolvedResumeUrl ?? candRow.resume_url, resume.slice(0, 500_000)]
      );
      await refreshResumeEmbeddingForCandidate(candidateId, candRow.created_by_user_id);
    } catch (error) {
      console.warn("singleMatchCheck: failed to persist recovered resume source", error);
    }
  }

  if (useAI) {
    if (!process.env.OPENAI_API_KEY) {
      throw Object.assign(new Error("OPENAI_API_KEY is not set - required for AI match check"), {
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
        new Error("OpenAI scoring failed or returned no result for this candidate - try again or check logs"),
        { statusCode: 502 }
      );
    }

    const ai = aiMap.get(candidateId)!;
    const advanced = await buildAdvancedPureAiInsights({
      jobTitle: jobRow.title.trim(),
      jobDescription: jd,
      experienceRequirement: jobRow.experience_requirement?.trim() || null,
      mustHave: hints.mustHave,
      niceToHave: hints.niceToHave,
      keywords: hints.keywords,
      resumeText: resume || "",
      resumeSource: resolvedResume.source,
      resumeCharsScored: resolvedResume.charCount,
      jdCharsScored: jd.length,
      baseAi: ai,
    });

    const result: SingleMatchCheckResultPayload = {
      match_score: advanced.match_score,
      match_score_no_ai: null,
      ai_match_score: advanced.ai_match_score,
      decision: advanced.decision,
      decision_no_ai: null,
      ai_decision: advanced.ai_decision,
      matched_skills: advanced.matched_skills,
      missing_required_skills: advanced.missing_required_skills,
      reasoning: withResumeSourceWarning(advanced.reasoning, resolvedResume.source, recovery),
      summary: advanced.summary,
      resume_source: advanced.resume_source,
      resume_chars_scored: advanced.resume_chars_scored,
      jd_chars_scored: advanced.jd_chars_scored,
      ai_evidence_highlights: advanced.ai_evidence_highlights,
      requirement_breakdown: advanced.requirement_breakdown,
      confidence_score: advanced.confidence_score,
      confidence_reasons: advanced.confidence_reasons,
      resume_quality_flags: advanced.resume_quality_flags,
      decision_drivers: advanced.decision_drivers,
      risk_flags: advanced.risk_flags,
      interview_focus_areas: advanced.interview_focus_areas,
      follow_up_questions: advanced.follow_up_questions,
      recommended_next_step: advanced.recommended_next_step,
      evidence_quality: advanced.evidence_quality,
      fit_level: advanced.fit_level,
      score_breakdown: advanced.score_breakdown,
      partial_matches: advanced.partial_matches,
      missing_nice_to_have_requirements: advanced.missing_nice_to_have_requirements,
      critical_unknowns: advanced.critical_unknowns,
      red_flags: advanced.red_flags,
      recruiter_summary: advanced.recruiter_summary,
      candidate_feedback: advanced.candidate_feedback,
      resume_recovery_attempted: recovery?.attempted ?? false,
      resume_recovery_succeeded: recovery?.succeeded ?? false,
      resume_recovery_reason: recovery?.reason ?? null,
      resume_source_before_recovery: recovery?.sourceBefore ?? resolvedResume.source,
      resume_source_after_recovery: recovery?.sourceAfter ?? resolvedResume.source,
      debug_requirements: advanced.debug_requirements,
      developer_debug: advanced.developer_debug,
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
