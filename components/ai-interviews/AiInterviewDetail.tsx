"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Mail,
  RefreshCw,
  Save,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

type Question = {
  id?: number;
  order_number?: number;
  question_text: string;
  skill_name: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  expected_points_json: string[];
  scoring_rubric_json: Array<{ criterion: string; weight: number }>;
  max_score: number;
  question_type?: "TECHNICAL" | "CODING";
  starter_code?: string | null;
  coding_language?: string;
};
export default function AiInterviewDetail({ id }: { id: number }) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [recruiterQuestions, setRecruiterQuestions] = useState<Question[]>([]);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const r = await fetch(`/api/ai-interviews/${id}`, { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Failed to load");
    setData(d);
    setQuestions(d.questions || []);
    setRecruiterQuestions(d.recruiter_questions || []);
  }, [id]);
  useEffect(() => {
    setLink(sessionStorage.getItem(`ai-interview-link:${id}`) || "");
    void load().catch((e) => setError(e.message));
  }, [id, load]);
  async function action(
    name: string,
    url: string,
    options: RequestInit = { method: "POST" },
  ) {
    setBusy(name);
    setError("");
    setMessage("");
    try {
      const r = await fetch(url, options);
      const d = await r.json();
      if (d.public_url) {
        setLink(d.public_url);
        sessionStorage.setItem(`ai-interview-link:${id}`, d.public_url);
      }
      if (!r.ok)
        throw new Error(
          [d.error, d.detail].filter(Boolean).join(": ") || "Action failed",
        );
      setMessage(
        name === "send"
          ? `Invitation accepted for delivery to ${d.recipient || interview.candidate_email || "the candidate"}.`
          : "Interview updated successfully.",
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy("");
    }
  }
  async function saveQuestions() {
    const payload = questions.map((q) => ({
      question: q.question_text,
      skill: q.skill_name || "General",
      difficulty: q.difficulty,
      expectedPoints: q.expected_points_json?.length
        ? q.expected_points_json
        : ["Relevant and accurate explanation"],
      scoringRubric: q.scoring_rubric_json?.length
        ? q.scoring_rubric_json
        : [{ criterion: "Accuracy and relevance", weight: 100 }],
      maxScore: Number(q.max_score || 10),
      question_type: q.question_type || "TECHNICAL",
      starter_code: q.starter_code || null,
      coding_language: q.coding_language || "python",
    }));
    await action("save", `/api/ai-interviews/${id}/questions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions: payload }),
    });
  }
  function blankQuestion(): Question {
    return { question_text: "", skill_name: "General", difficulty: "INTERMEDIATE", expected_points_json: ["Relevant and accurate explanation"], scoring_rubric_json: [{ criterion: "Accuracy and relevance", weight: 100 }], max_score: 10, question_type: "TECHNICAL", starter_code: null, coding_language: "python" };
  }
  async function saveRecruiterQuestions() {
    await action("manual-save", `/api/ai-interviews/${id}/recruiter-questions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions: recruiterQuestions.map((q) => ({ question: q.question_text, skill: q.skill_name, difficulty: q.difficulty, expectedPoints: q.expected_points_json, scoringRubric: q.scoring_rubric_json, maxScore: q.max_score })) }),
    });
  }
  async function deleteInterview() {
    if (
      !window.confirm(
        "Permanently delete this AI interview, its report, recording, and snapshot? This cannot be undone.",
      )
    )
      return;
    setBusy("delete");
    setError("");
    try {
      const r = await fetch(`/api/ai-interviews/${id}/delete`, {
        method: "DELETE",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Interview could not be deleted");
      router.push("/ai-interviews");
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Interview could not be deleted",
      );
      setBusy("");
    }
  }
  async function deleteRecording() {
    if (
      !window.confirm(
        "Delete only the stored recording to reclaim disk space? The interview, transcript, evaluation, snapshot, answers, and report will be preserved.",
      )
    )
      return;
    setBusy("recording-delete");
    setError("");
    try {
      const r = await fetch(`/api/ai-interviews/${id}/recording`, {
        method: "DELETE",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Recording could not be deleted");
      setMessage(
        d.reclaimed_bytes
          ? `Recording removed. ${(Number(d.reclaimed_bytes) / 1024 / 1024).toFixed(1)} MB reclaimed.`
          : "Recording removed. All report data remains available.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Recording could not be deleted",
      );
    } finally {
      setBusy("");
    }
  }
  function update(index: number, patch: Partial<Question>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  }
  function move(index: number, direction: -1 | 1) {
    setQuestions((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  if (!data)
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
        {error || "Loading AI interview..."}
      </div>
    );
  const interview = data.interview;
  const editable = interview.status === "DRAFT";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/ai-interviews"
            className="text-sm font-semibold text-blue-700"
          >
            AI Interviews
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            {interview.title}
          </h1>
          <p className="text-sm text-slate-600">
            {interview.candidate_name} · {interview.job_title}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {interview.status === "COMPLETED" && (
            <Link
              href={`/ai-interviews/${id}/report`}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Open report
            </Link>
          )}
          {data.capabilities?.can_delete && (
            <button
              disabled={!!busy}
              onClick={() => void deleteInterview()}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {busy === "delete" ? "Deleting..." : "Delete"}
            </button>
          )}
          <Link
            href="/ai-interviews/settings"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Settings
          </Link>
        </div>
      </div>
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </div>
      )}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          ["Status", interview.status],
          ["Mode", interview.interview_mode || "FIXED"],
          ["Questions", questions.length],
          ["Duration", `${interview.duration_minutes} min`],
          ["Evaluation", interview.evaluation_status],
          ["Recording", interview.video_status],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </div>
            <div className="mt-1 font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </section>
      {interview.video_status === "UPLOADED" && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h2 className="font-bold text-slate-950">Stored recording</h2>
            <p className="text-sm text-slate-500">
              Download it locally or remove only the video to save server disk
              space.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href={`/api/ai-interviews/${id}/recording?download=1`}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"
            >
              <Download className="h-4 w-4" />
              Download recording
            </a>
            {data.capabilities?.can_delete_recording && (
              <button
                disabled={!!busy}
                onClick={() => void deleteRecording()}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700"
              >
                <Trash2 className="h-4 w-4" />
                {busy === "recording-delete"
                  ? "Deleting..."
                  : "Delete recording"}
              </button>
            )}
          </div>
        </section>
      )}
      {interview.video_status === "DELETED_BY_RECRUITER" && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          The recording was removed to save storage. Transcript, answers,
          evaluation, snapshot, and report are preserved.
        </div>
      )}
      {link && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-2 font-bold text-blue-950">
            <ShieldCheck className="h-5 w-5" />
            Secure candidate link
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={link}
              className="min-w-0 flex-1 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm"
            />
            <button
              onClick={() =>
                void navigator.clipboard
                  .writeText(link)
                  .then(() => setMessage("Link copied."))
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-blue-700 ring-1 ring-blue-200"
            >
              <Copy className="h-4 w-4" />
              Copy
            </button>
          </div>
          <p className="mt-2 text-xs text-blue-700">
            Generating or sending a new link revokes this link.
          </p>
        </section>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-950">
              {interview.interview_mode === "ADAPTIVE"
                ? "Opening question"
                : "Interview questions"}
            </h2>
            <p className="text-sm text-slate-500">
              {interview.interview_mode === "ADAPTIVE"
                ? "Review the opening question. Later questions are generated one at a time from verified interview evidence."
                : "Review every AI-generated question before activation."}
            </p>
          </div>
          {editable && (
            <div className="flex gap-2">
              {interview.interview_mode !== "ADAPTIVE" && (
                <button type="button" onClick={() => setQuestions((prev) => [...prev, blankQuestion()])} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold">
                  <Plus className="h-4 w-4" /> Add manual question
                </button>
              )}
              <button
                disabled={!!busy}
                onClick={() =>
                  void action(
                    "regenerate",
                    `/api/ai-interviews/${id}/questions`,
                  )
                }
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
              >
                <RefreshCw className="h-4 w-4" />
                Regenerate
              </button>
              <button
                disabled={!!busy}
                onClick={() => void saveQuestions()}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              >
                <Save className="h-4 w-4" />
                Save questions
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 space-y-3">
          {questions.map((q, index) => (
            <article
              key={q.id || index}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-blue-700">
                  Question {index + 1}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                    {q.difficulty}
                  </span>
                </div>
                {editable && (
                  <div className="flex gap-1">
                    <button
                      aria-label="Move question up"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-30"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      aria-label="Move question down"
                      disabled={index === questions.length - 1}
                      onClick={() => move(index, 1)}
                      className="rounded-lg border border-slate-200 p-1.5 disabled:opacity-30"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      aria-label="Delete question"
                      disabled={questions.length <= 1}
                      onClick={() =>
                        setQuestions((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                      className="rounded-lg border border-rose-200 p-1.5 text-rose-600 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <textarea
                disabled={!editable}
                rows={3}
                value={q.question_text}
                onChange={(e) =>
                  update(index, { question_text: e.target.value })
                }
                className="w-full rounded-xl border border-slate-200 p-3 text-sm disabled:bg-slate-50"
              />
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <select
                  disabled={!editable}
                  value={q.question_type || "TECHNICAL"}
                  onChange={(e) =>
                    update(index, { question_type: e.target.value as "TECHNICAL" | "CODING" })
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
                >
                  <option value="TECHNICAL">Technical / Behavioural</option>
                  <option value="CODING">💻 Coding (LeetCode-style)</option>
                </select>
                <input
                  disabled={!editable}
                  value={q.skill_name || ""}
                  onChange={(e) =>
                    update(index, { skill_name: e.target.value })
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Skill"
                />
                <input
                  disabled={!editable}
                  value={(q.expected_points_json || []).join("; ")}
                  onChange={(e) =>
                    update(index, {
                      expected_points_json: e.target.value
                        .split(";")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Expected points separated by ;"
                />
              </div>
              {q.question_type === "CODING" && (
                <div className="mt-3 space-y-2 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-700">Coding question settings</span>
                    <select
                      disabled={!editable}
                      value={q.coding_language || "python"}
                      onChange={(e) => update(index, { coding_language: e.target.value })}
                      className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-xs"
                    >
                      <option value="python">Python</option>
                      <option value="javascript">JavaScript</option>
                      <option value="typescript">TypeScript</option>
                      <option value="java">Java</option>
                      <option value="cpp">C++</option>
                      <option value="go">Go</option>
                      <option value="rust">Rust</option>
                      <option value="sql">SQL</option>
                    </select>
                  </div>
                  <textarea
                    disabled={!editable}
                    rows={6}
                    value={q.starter_code || ""}
                    onChange={(e) => update(index, { starter_code: e.target.value })}
                    placeholder={`# Starter code for candidate (optional)\ndef solution():\n    pass`}
                    className="w-full rounded-xl border border-blue-200 bg-white p-3 font-mono text-xs disabled:bg-slate-50"
                    spellCheck={false}
                  />
                  <p className="text-xs text-blue-600">The candidate will see a Monaco code editor pre-filled with this starter code.</p>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      {interview.interview_mode === "ADAPTIVE" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-bold text-slate-950">Required recruiter questions</h2><p className="text-sm text-slate-500">These are queued into the adaptive interview and remain recruiter-authored in the report.</p></div>
            {editable && <div className="flex gap-2"><button type="button" onClick={() => setRecruiterQuestions((prev) => [...prev, blankQuestion()])} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"><Plus className="h-4 w-4" /> Add question</button><button type="button" disabled={!!busy} onClick={() => void saveRecruiterQuestions()} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"><Save className="h-4 w-4" /> Save manual questions</button></div>}
          </div>
          <div className="mt-4 space-y-3">{recruiterQuestions.map((q, index) => <article key={q.id || index} className="rounded-xl border border-slate-200 p-4"><div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-blue-700"><span>Recruiter question {index + 1}</span>{editable && <button type="button" onClick={() => setRecruiterQuestions((prev) => prev.filter((_, i) => i !== index))} className="rounded-lg border border-rose-200 p-1.5 text-rose-600"><Trash2 className="h-4 w-4" /></button>}</div><textarea disabled={!editable} rows={3} value={q.question_text} onChange={(e) => setRecruiterQuestions((prev) => prev.map((item, i) => i === index ? { ...item, question_text: e.target.value } : item))} className="w-full rounded-xl border border-slate-200 p-3 text-sm disabled:bg-slate-50" /></article>)}</div>
        </section>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {["FAILED", "PROCESSING"].includes(interview.status) &&
          interview.evaluation_status !== "COMPLETED" && (
            <button
              disabled={!!busy}
              onClick={() =>
                void action("retry", `/api/ai-interviews/${id}/retry`)
              }
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800"
            >
              {busy === "retry"
                ? "Starting evaluation..."
                : interview.status === "FAILED"
                  ? "Retry evaluation"
                  : "Process evaluation now"}
            </button>
          )}
        {editable && (
          <button
            disabled={!!busy}
            onClick={() =>
              void action("activate", `/api/ai-interviews/${id}/activate`)
            }
            className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800"
          >
            Activate and generate link
          </button>
        )}{" "}
        {![
          "COMPLETED",
          "CANCELLED",
          "EXPIRED",
          "PROCESSING",
          "FAILED",
        ].includes(interview.status) && (
          <>
            <button
              disabled={!!busy}
              onClick={() =>
                void action("cancel", `/api/ai-interviews/${id}`, {
                  method: "DELETE",
                })
              }
              className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700"
            >
              Cancel
            </button>
            <button
              disabled={!!busy}
              onClick={() =>
                void action("send", `/api/ai-interviews/${id}/send`)
              }
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white"
            >
              <Mail className="h-4 w-4" />
              Send invitation
            </button>
          </>
        )}
      </div>
    </div>
  );
}
