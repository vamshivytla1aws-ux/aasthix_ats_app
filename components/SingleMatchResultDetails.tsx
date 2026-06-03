"use client";

import type { SingleMatchCheckResultPayload } from "@/lib/singleMatch/types";

function decisionBadgeClass(d: string | null | undefined): string {
  const s = (d || "").toLowerCase();
  if (s.includes("reject")) return "bg-rose-100 text-rose-900 border border-rose-200";
  if (s.includes("hold")) return "bg-amber-100 text-amber-900 border border-amber-200";
  if (s.includes("proceed") || s.includes("interview")) return "bg-emerald-100 text-emerald-900 border border-emerald-200";
  return "bg-slate-100 text-slate-700 border border-slate-200";
}

function resumeSourceLabel(source: SingleMatchCheckResultPayload["resume_source"]): string {
  switch (source) {
    case "uploaded_resume_file":
      return "uploaded resume file";
    case "stored_resume_text":
      return "stored resume text";
    case "experience_summary_or_skills":
      return "experience summary or skills";
    case "none":
      return "no usable resume source";
    default:
      return "unknown source";
  }
}

function requirementStatusClass(status: string | null | undefined): string {
  switch (status) {
    case "met":
      return "bg-emerald-100 text-emerald-900 border border-emerald-200";
    case "partially_met":
      return "bg-amber-100 text-amber-900 border border-amber-200";
    case "unclear_due_to_source_quality":
      return "bg-sky-100 text-sky-900 border border-sky-200";
    case "not_met":
      return "bg-rose-100 text-rose-900 border border-rose-200";
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200";
  }
}

function requirementStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "met":
      return "Met";
    case "partially_met":
      return "Partial";
    case "unclear_due_to_source_quality":
      return "Unclear";
    case "not_met":
      return "Missing";
    default:
      return "Unknown";
  }
}

type Props = {
  result: SingleMatchCheckResultPayload;
  modeLabel?: string | null;
  loadedFromHistoryAt?: string | null;
  className?: string;
};

export function SingleMatchResultDetails({ result, modeLabel, loadedFromHistoryAt, className = "" }: Props) {
  const resumeSourceWarning =
    result?.resume_source === "experience_summary_or_skills"
      ? {
          tone: "warning" as const,
          title: "Scoring is using fallback profile text",
          body:
            "This result is based on summary / skills fallback text instead of a parsed uploaded resume. We should treat missing skills and the percentage as low-confidence until a full resume is linked and parsed.",
        }
      : result?.resume_source === "none"
        ? {
            tone: "danger" as const,
            title: "No full resume was available for scoring",
            body:
              "This pure-AI result is running without usable resume text. Upload a PDF/DOCX resume or save resume text before trusting the score or gaps.",
          }
        : result?.resume_source === "stored_resume_text" &&
            typeof result.resume_chars_scored === "number" &&
            result.resume_chars_scored < 800
          ? {
              tone: "warning" as const,
              title: "Stored resume text looks short",
              body:
                "The match used stored resume text, but the scored text is quite short. If the uploaded resume has more detail, relink or reparse it so the full JD can be validated against the full resume.",
            }
          : null;

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm ${className}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Result</span>
        {modeLabel ? (
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200">
            {modeLabel}
          </span>
        ) : null}
      </div>
      {loadedFromHistoryAt ? (
        <p className="mb-2 text-[11px] text-slate-500">
          Loaded saved result from {new Date(loadedFromHistoryAt).toLocaleString()}.
        </p>
      ) : null}

      <div className="mb-3 flex flex-wrap items-end gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase text-slate-500">Overall</div>
          <div className="text-2xl font-bold text-slate-900">{result.match_score}%</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase text-slate-500">No-AI</div>
          <div className="text-lg font-semibold text-slate-800">
            {result.match_score_no_ai != null ? `${result.match_score_no_ai}%` : "-"}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase text-slate-500">AI</div>
          <div className="text-lg font-semibold text-slate-800">
            {result.ai_match_score != null ? `${Math.round(result.ai_match_score)}%` : "-"}
          </div>
        </div>
        {result.confidence_score != null ? (
          <div>
            <div className="text-[10px] font-semibold uppercase text-slate-500">Confidence</div>
            <div className="text-lg font-semibold text-slate-800">{result.confidence_score}%</div>
          </div>
        ) : null}
        {result.evidence_quality ? (
          <div>
            <div className="text-[10px] font-semibold uppercase text-slate-500">Evidence</div>
            <div className="text-sm font-semibold capitalize text-slate-800">{result.evidence_quality}</div>
          </div>
        ) : null}
        {result.fit_level ? (
          <div>
            <div className="text-[10px] font-semibold uppercase text-slate-500">Fit</div>
            <div className="text-sm font-semibold text-slate-800">{result.fit_level}</div>
          </div>
        ) : null}
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {result.decision ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${decisionBadgeClass(result.decision)}`}>
            {result.decision}
          </span>
        ) : null}
        {result.decision_no_ai ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${decisionBadgeClass(result.decision_no_ai)}`}>
            No-AI: {result.decision_no_ai}
          </span>
        ) : null}
        {result.ai_decision ? (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${decisionBadgeClass(result.ai_decision)}`}>
            AI: {result.ai_decision}
          </span>
        ) : null}
      </div>

      {result.summary ? <p className="mb-2 text-xs text-slate-600">{result.summary}</p> : null}
      {resumeSourceWarning ? (
        <div
          className={`mb-2 rounded-lg border px-2 py-1.5 text-xs ${
            resumeSourceWarning.tone === "danger"
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <div className="font-semibold">{resumeSourceWarning.title}</div>
          <div className="mt-0.5">{resumeSourceWarning.body}</div>
        </div>
      ) : null}
      {result.reasoning ? (
        <p className="mb-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">{result.reasoning}</p>
      ) : null}
      {result.candidate_feedback ? (
        <div className="mb-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
          <div className="font-semibold text-slate-900">Candidate feedback</div>
          <p className="mt-1">{result.candidate_feedback}</p>
        </div>
      ) : null}

      {result.resume_source || result.resume_chars_scored != null || result.jd_chars_scored != null ? (
        <div className="mb-2 rounded-lg border border-indigo-100 bg-indigo-50 px-2 py-1.5 text-[11px] text-slate-700">
          <span className="font-semibold text-indigo-900">Scored text:</span>{" "}
          {result.resume_source ? `resume source ${resumeSourceLabel(result.resume_source)}` : "resume source unknown"}
          {result.resume_chars_scored != null ? ` · resume chars ${result.resume_chars_scored}` : ""}
          {result.jd_chars_scored != null ? ` · JD chars ${result.jd_chars_scored}` : ""}
        </div>
      ) : null}

      {result.ai_evidence_highlights?.length ? (
        <div className="mb-2 rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1.5 text-[11px] text-slate-700">
          <div className="font-semibold text-emerald-900">AI evidence found in resume</div>
          <ul className="mt-1 list-inside list-disc">
            {result.ai_evidence_highlights.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.score_breakdown ? (
        <div className="mb-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700">
          <div className="mb-2 font-semibold text-slate-900">Score breakdown</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(result.score_breakdown).map(([key, value]) => (
              <div key={key} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
                <div className="font-medium text-slate-900">{key.replace(/_/g, " ")}</div>
                <div className="mt-1 text-[11px] text-slate-600">
                  {value.score}/{value.max_score}
                </div>
                {Array.isArray(value.details) ? (
                  <ul className="mt-1 list-inside list-disc text-[11px] text-slate-700">
                    {value.details.slice(0, 5).map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-700">{value.details}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {result.confidence_reasons?.length ? (
        <div className="mb-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700">
          <div className="font-semibold text-slate-900">Confidence reasons</div>
          <ul className="mt-1 list-inside list-disc">
            {result.confidence_reasons.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.requirement_breakdown?.length ? (
        <div className="mb-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-700">
          <div className="mb-2 font-semibold text-slate-900">Requirement breakdown</div>
          <div className="grid gap-2">
            {result.requirement_breakdown.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-slate-900">{item.label}</div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${requirementStatusClass(item.status)}`}>
                    {requirementStatusLabel(item.status)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-slate-500">
                  <span>{item.bucket.replace(/_/g, " ")}</span>
                  <span>{item.priority.replace(/_/g, " ")}</span>
                  {item.match_type ? <span>{item.match_type.replace(/_/g, " ")}</span> : null}
                  {item.score_awarded != null && item.max_score != null ? <span>{item.score_awarded}/{item.max_score}</span> : null}
                </div>
                {item.rationale ? <p className="mt-1 text-[11px] text-slate-600">{item.rationale}</p> : null}
                {item.evidence?.length ? (
                  <ul className="mt-1 list-inside list-disc text-[11px] text-slate-700">
                    {item.evidence.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 text-xs sm:grid-cols-2">
        {result.decision_drivers?.length ? (
          <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-700">
            <div className="font-semibold text-slate-900">Decision drivers</div>
            <ul className="mt-1 list-inside list-disc">
              {result.decision_drivers.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.risk_flags?.length ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-rose-900">
            <div className="font-semibold">Risk flags</div>
            <ul className="mt-1 list-inside list-disc">
              {result.risk_flags.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.interview_focus_areas?.length ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-indigo-900">
            <div className="font-semibold">Interview focus areas</div>
            <ul className="mt-1 list-inside list-disc">
              {result.interview_focus_areas.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.follow_up_questions?.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
            <div className="font-semibold">Follow-up questions</div>
            <ul className="mt-1 list-inside list-disc">
              {result.follow_up_questions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.critical_unknowns?.length ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-sky-900">
            <div className="font-semibold">Critical unknowns</div>
            <ul className="mt-1 list-inside list-disc">
              {result.critical_unknowns.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {result.resume_quality_flags?.length ? (
        <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-900">
          <div className="font-semibold">Resume quality flags</div>
          <ul className="mt-1 list-inside list-disc">
            {result.resume_quality_flags.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.missing_nice_to_have_requirements?.length ? (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
          <div className="font-semibold text-slate-900">Missing nice-to-have</div>
          <ul className="mt-1 list-inside list-disc">
            {result.missing_nice_to_have_requirements.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.partial_matches?.length ? (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
          <div className="font-semibold">Partial matches</div>
          <ul className="mt-1 list-inside list-disc">
            {result.partial_matches.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.recommended_next_step ? (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
          <div className="font-semibold">Recommended next step</div>
          <p className="mt-1">{result.recommended_next_step}</p>
        </div>
      ) : null}

      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <div className="font-semibold text-emerald-800">Matched required</div>
          <ul className="mt-0.5 list-inside list-disc text-slate-700">
            {result.matched_skills.length ? (
              result.matched_skills.slice(0, 24).map((s) => <li key={s}>{s}</li>)
            ) : (
              <li className="list-none text-slate-500">None listed</li>
            )}
            {result.matched_skills.length > 24 ? (
              <li className="list-none text-slate-500">+{result.matched_skills.length - 24} more</li>
            ) : null}
          </ul>
        </div>
        <div>
          <div className="font-semibold text-amber-900">Missing required</div>
          <ul className="mt-0.5 list-inside list-disc text-slate-700">
            {result.missing_required_skills.length ? (
              result.missing_required_skills.slice(0, 24).map((s) => <li key={s}>{s}</li>)
            ) : (
              <li className="list-none text-slate-500">None listed</li>
            )}
            {result.missing_required_skills.length > 24 ? (
              <li className="list-none text-slate-500">+{result.missing_required_skills.length - 24} more</li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
