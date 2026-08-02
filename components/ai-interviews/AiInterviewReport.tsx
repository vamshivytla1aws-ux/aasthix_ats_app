"use client";

/* eslint-disable @next/next/no-img-element -- authenticated snapshots cannot use the public image optimizer */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Download, Printer, Trash2 } from "lucide-react";

function formatIst(value?: string | null) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

function label(value?: string | null) {
  return value
    ? value
        .replaceAll("_", " ")
        .replace(/\b\w/g, (character) => character.toUpperCase())
    : "Not available";
}

export default function AiInterviewReport({ id }: { id: number }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [decision, setDecision] = useState("");
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const load = useCallback(async () => {
    return fetch(`/api/ai-interviews/${id}/report`, { cache: "no-store" }).then(
      async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || "Could not load report");
        setData(payload);
        setDecision(payload.interview.recruiter_decision || "");
        setComments(payload.interview.recruiter_comments || "");
      },
    );
  }, [id]);

  useEffect(() => {
    void load().catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : "Could not load report",
      ),
    );
  }, [load]);

  async function deleteRecording() {
    if (
      !window.confirm(
        "Delete only the recording to save disk space? The transcript, answers, evaluation, snapshot, and report will remain available.",
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/ai-interviews/${id}/recording`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Could not delete recording");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not delete recording",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveDecision() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const response = await fetch(`/api/ai-interviews/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recruiter_decision: decision,
          recruiter_comments: comments,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Could not save decision");
      setData((current: any) => ({
        ...current,
        interview: {
          ...current.interview,
          recruiter_decision: payload.recruiter_decision,
          recruiter_comments: payload.recruiter_comments,
        },
      }));
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save decision",
      );
    } finally {
      setSaving(false);
    }
  }

  function printReport(title: string) {
    const previousTitle = document.title;
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restore);
    };
    document.title = title;
    window.addEventListener("afterprint", restore);
    window.print();
  }

  if (!data)
    return (
      <div className="p-8 text-center text-slate-500">
        {error || "Loading report..."}
      </div>
    );
  const interview = data.interview;
  const evaluation = data.evaluation;
  const reportTime =
    interview.started_at || interview.completed_at || interview.created_at;
  const reportTitle = `AI Interview Report - ${interview.candidate_name} - ${interview.job_title} - ${formatIst(reportTime)}`;
  const scores = [
    ["Overall", interview.overall_score],
    ["Technical", interview.technical_score],
    ["Communication", interview.communication_score],
    ["Experience relevance", interview.experience_relevance_score],
  ];

  return (
    <div className="ai-interview-print-root space-y-5 print:space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <Link
            href={`/ai-interviews/${id}`}
            className="text-sm font-semibold text-blue-700 print:hidden"
          >
            Interview details
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 print:text-xl">
            {reportTitle}
          </h1>
        </div>
        <button
          onClick={() => printReport(reportTitle)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold print:hidden"
        >
          <Printer className="h-4 w-4" />
          Print report
        </button>
      </header>
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 print:hidden">
          {error}
        </div>
      )}

      {interview.video_status === "UPLOADED" && data.recording_available && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Interview recording</h2><p className="text-sm text-slate-500">Review the candidate alongside the evidence and evaluation below.</p></div><div className="flex gap-2"><a href={`/api/ai-interviews/${id}/recording?download=1`} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"><Download className="h-4 w-4" /> Download</a>{data.capabilities?.can_delete_recording && <button disabled={saving} onClick={() => void deleteRecording()} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700"><Trash2 className="h-4 w-4" /> Delete recording</button>}</div></div>
          <video ref={videoRef} controls className="mt-3 max-h-[520px] w-full rounded-xl bg-black" src={`/api/ai-interviews/${id}/recording`} />
        </section>
      )}

      <section className="ai-print-card grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-[1fr_220px] print:grid-cols-[1fr_160px] print:p-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950">
            {interview.candidate_name}
          </h2>
          <div className="mt-3 grid gap-x-6 gap-y-1 text-sm text-slate-700 sm:grid-cols-2">
            <p>
              <strong>Role:</strong> {interview.job_title}
            </p>
            <p>
              <strong>Email:</strong>{" "}
              {interview.candidate_email || "Not available"}
            </p>
            <p>
              <strong>Phone:</strong>{" "}
              {interview.candidate_phone || "Not available"}
            </p>
            <p>
              <strong>Experience:</strong>{" "}
              {interview.experience_requirement || "Not specified"}
            </p>
            <p>
              <strong>Started:</strong> {formatIst(interview.started_at)}
            </p>
            <p>
              <strong>Completed:</strong> {formatIst(interview.completed_at)}
            </p>
          </div>
          {interview.video_status === "UPLOADED" && (
            <a
              href={`/api/ai-interviews/${id}/recording?download=1`}
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 print:hidden"
            >
              <Download className="h-4 w-4" />
              Download recording
            </a>
          )}
        </div>
        {interview.snapshot_status === "CAPTURED" ? (
          <div>
            <img
              src={`/api/ai-interviews/${id}/snapshot`}
              alt={`${interview.candidate_name} during AI interview`}
              className="aspect-[4/3] w-full rounded-xl border border-slate-200 object-cover"
            />
            <a
              href={`/api/ai-interviews/${id}/snapshot?download=1`}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 print:hidden"
            >
              <Download className="h-4 w-4" />
              Download image
            </a>
          </div>
        ) : (
          <div className="flex min-h-40 items-center justify-center rounded-xl bg-slate-100 p-4 text-center text-sm text-slate-500">
            No candidate snapshot captured.
          </div>
        )}
      </section>

      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
        {scores.map(([name, value]) => (
          <div
            key={String(name)}
            className="ai-print-card rounded-2xl border border-slate-200 bg-white p-4"
          >
            <div className="text-xs font-semibold uppercase text-slate-500">
              {name}
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-950">
              {value == null ? "-" : `${Math.round(Number(value))}%`}
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3 print:grid-cols-3">
        <div className="ai-print-card rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2 print:col-span-2 print:p-4">
          <h2 className="font-bold">Overall evaluation</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {evaluation?.summary || "Evaluation is still processing."}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 print:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold text-emerald-700">Strengths</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {(evaluation?.strengths_json || []).map((item: string) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-700">Concerns</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {(evaluation?.concerns_json || []).map((item: string) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="ai-print-card rounded-2xl border border-slate-200 bg-white p-5 print:p-4">
          <h2 className="font-bold">Outcome</h2>
          <p className="mt-2 text-lg font-bold text-blue-800">
            {label(evaluation?.recommendation || interview.ai_recommendation)}
          </p>
          <p className="mt-4 text-xs font-semibold uppercase text-slate-500">
            Integrity risk
          </p>
          <p className="mt-1 font-bold">{label(interview.integrity_risk)}</p>
          <p className="mt-2 text-xs text-slate-500">
            Integrity signals remain separate from performance scoring and
            require human review.
          </p>
        </div>
      </section>

      {interview.interview_mode === "ADAPTIVE" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 print:p-4">
          <h2 className="font-bold">Mandatory skill coverage</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 print:grid-cols-2">
            {(interview.skill_coverage_json || []).map((item: any) => (
              <div
                key={item.skill}
                className="ai-print-card rounded-xl border border-slate-100 p-3"
              >
                <div className="flex justify-between gap-3 text-sm">
                  <strong>{item.skill}</strong>
                  <span>
                    {Number(item.coverage || 0) >= 70
                      ? "Fully evaluated"
                      : Number(item.questionsAsked || 0) > 0
                        ? "Partially evaluated"
                        : "Not evaluated"}
                  </span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{
                      width: `${Math.min(100, Number(item.coverage || 0))}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {Math.round(Number(item.coverage || 0))}% evidence confidence
                  · {item.questionsAsked || 0} question(s)
                </p>
              </div>
            ))}
          </div>
          {(interview.adaptive_state_json?.projectsCovered || []).length >
            0 && (
            <p className="mt-3 text-sm text-slate-700">
              <strong>Projects discussed:</strong>{" "}
              {interview.adaptive_state_json.projectsCovered.join(", ")}
            </p>
          )}
          {(interview.adaptive_state_json?.unverifiedClaims || []).length >
            0 && (
            <p className="mt-2 text-sm text-amber-800">
              <strong>Claims requiring recruiter review:</strong>{" "}
              {interview.adaptive_state_json.unverifiedClaims.join("; ")}
            </p>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 print:p-4">
        <h2 className="font-bold">Question-by-question evaluation</h2>
        <div className="mt-4 space-y-4">
          {data.answers.map((answer: any) => (
            <article
              key={answer.order_number}
              className="ai-print-card rounded-xl border border-slate-200 p-4"
            >
              <div className="flex justify-between gap-3">
                <div className="font-bold text-slate-900">
                  {answer.order_number}. {answer.question_text}
                </div>
                <div className="whitespace-nowrap font-bold text-blue-700">
                  {answer.score == null
                    ? "-"
                    : `${answer.score}/${answer.max_score}`}
                </div>
              </div>
              <div className="mt-2 text-xs font-semibold uppercase text-slate-500">
                {answer.generated_by_ai ? "AI-generated" : "Recruiter-authored"} ·{" "}
                {answer.skill_name} ·{" "}
                {answer.adaptive_depth || answer.difficulty}
                {answer.adaptive_strategy
                  ? ` · ${label(answer.adaptive_strategy)}`
                  : ""}
              </div>
              {answer.reason_for_asking && (
                <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700">
                  <p>
                    <strong>Why asked:</strong> {answer.reason_for_asking}
                  </p>
                  <p className="mt-1">
                    <strong>Source:</strong> {label(answer.source_type)} ·{" "}
                    {answer.source_reference}
                  </p>
                  {answer.project_name && (
                    <p className="mt-1">
                      <strong>Project:</strong> {answer.project_name}
                    </p>
                  )}
                  {answer.triggering_answer_id && (
                    <p className="mt-1">
                      <strong>Follow-up:</strong> Generated from the preceding
                      candidate answer.
                    </p>
                  )}
                </div>
              )}
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                <strong>Candidate answer:</strong>
                <br />
                {answer.transcript || "No answer submitted."}
              </p>
              {answer.evaluator_feedback && (
                <p className="mt-2 text-sm text-slate-700">
                  <strong>Evaluation:</strong> {answer.evaluator_feedback}
                </p>
              )}
              {(
                answer.expected_signals_json ||
                answer.expected_points_json ||
                []
              ).length > 0 && (
                <p className="mt-2 text-sm text-slate-700">
                  <strong>Expected signals:</strong>{" "}
                  {(
                    answer.expected_signals_json || answer.expected_points_json
                  ).join("; ")}
                </p>
              )}
              {(answer.strengths_json || []).length > 0 && (
                <p className="mt-2 text-sm text-emerald-800">
                  <strong>Evidence:</strong> {answer.strengths_json.join("; ")}
                </p>
              )}
              {(answer.missing_points_json || []).length > 0 && (
                <p className="mt-2 text-sm text-amber-800">
                  <strong>Missing points:</strong>{" "}
                  {answer.missing_points_json.join("; ")}
                </p>
              )}
              {(answer.adaptive_analysis_json?.contradictions || []).length >
                0 && (
                <p className="mt-2 text-sm text-amber-800">
                  <strong>Neutral review signals:</strong>{" "}
                  {answer.adaptive_analysis_json.contradictions.join("; ")}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      {data.events?.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 print:p-4">
          <h2 className="font-bold">Integrity review</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 print:grid-cols-2">
            {Object.entries(data.integrity_counts || {}).map(
              ([name, value]) => (
                <div
                  key={name}
                  className="ai-print-card flex justify-between rounded-lg border border-slate-100 p-2 text-sm"
                >
                  <span>{label(name)}</span>
                  <strong>{String(value)}</strong>
                </div>
              ),
            )}
          </div>
          <div className="mt-4 space-y-2 print:hidden">
            {data.events.map((event: any, index: number) => (
              <button
                key={`${event.occurred_at}-${index}`}
                onClick={() => {
                  if (
                    videoRef.current &&
                    event.evidence_timestamp_seconds != null
                  ) {
                    videoRef.current.currentTime = Number(
                      event.evidence_timestamp_seconds,
                    );
                    void videoRef.current.play();
                  }
                }}
                className="flex w-full justify-between rounded-xl border border-slate-100 p-3 text-left"
              >
                <span>
                  <strong>{label(event.event_type)}</strong>
                  <span className="block text-xs text-slate-500">
                    {formatIst(event.occurred_at)}
                  </span>
                </span>
                <span className="text-xs font-semibold text-amber-700">
                  {event.severity}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {false && interview.video_status === "UPLOADED" && data.recording_available && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Recording</h2>
              <p className="text-sm text-slate-500">
                Stored privately and available only to authorized reviewers.
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href={`/api/ai-interviews/${id}/recording?download=1`}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
              >
                <Download className="h-4 w-4" />
                Download recording
              </a>
              {data.capabilities?.can_delete_recording && (
                <button
                  disabled={saving}
                  onClick={() => void deleteRecording()}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete recording
                </button>
              )}
            </div>
          </div>
          <video
            ref={videoRef}
            controls
            className="mt-3 max-h-[520px] w-full rounded-xl bg-black"
            src={`/api/ai-interviews/${id}/recording`}
          />
        </section>
      )}
      {interview.video_status === "UPLOADED" && data.recording_available === false && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 print:hidden"><strong>Recording storage needs attention.</strong><p className="mt-1">{data.recording_availability_reason || "The physical recording cannot be read from this web service."}</p></div>
      )}
      {interview.video_status === "DELETED_BY_RECRUITER" && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 print:hidden">
          The recording was removed to save storage. Transcript, answers,
          evaluation, snapshot, and report remain available.
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 print:hidden">
        <h2 className="font-bold">Recruiter decision</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <select
            value={decision}
            onChange={(event) => setDecision(event.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2"
          >
            <option value="">Select decision</option>
            <option value="PROCEED">Proceed</option>
            <option value="HOLD">Hold</option>
            <option value="REJECT">Reject</option>
            <option value="SCHEDULE_HUMAN_INTERVIEW">
              Schedule human interview
            </option>
          </select>
          <textarea
            value={comments}
            onChange={(event) => setComments(event.target.value)}
            className="rounded-xl border border-slate-200 p-3 md:col-span-2"
            placeholder="Recruiter comments"
          />
        </div>
        <button
          disabled={saving || !decision}
          onClick={() => void saveDecision()}
          className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save decision"}
        </button>
        {saved && (
          <span className="ml-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Decision saved
          </span>
        )}
      </section>
      {interview.recruiter_decision && (
        <section className="ai-print-card hidden rounded-xl border border-slate-300 p-4 print:block">
          <h2 className="font-bold">Recruiter decision</h2>
          <p className="mt-1">
            <strong>{label(interview.recruiter_decision)}</strong>
          </p>
          {interview.recruiter_comments && (
            <p className="mt-2 text-sm">{interview.recruiter_comments}</p>
          )}
        </section>
      )}
    </div>
  );
}
