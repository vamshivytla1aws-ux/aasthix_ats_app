"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrainCircuit, Plus, RefreshCw, Trash2 } from "lucide-react";

type Row = {
  id: number;
  title: string;
  status: string;
  candidate_name: string;
  candidate_email: string;
  job_title: string;
  difficulty: string;
  question_count: number;
  duration_minutes: number;
  overall_score: number | null;
  integrity_risk: string | null;
  evaluation_status: string;
  created_at: string;
};

function badge(status: string) {
  if (status === "COMPLETED")
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "IN_PROGRESS" || status === "PROCESSING")
    return "bg-blue-50 text-blue-700 ring-blue-200";
  if (status === "FAILED" || status === "CANCELLED")
    return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-amber-50 text-amber-800 ring-amber-200";
}

export default function AiInterviewList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canDelete, setCanDelete] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/ai-interviews", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed to load");
      setRows(d.interviews || []);
      setCanDelete(d.configuration?.can_delete === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }
  async function remove(row: Row) {
    if (
      !window.confirm(
        `Permanently delete the AI interview for ${row.candidate_name}? This also deletes its report and stored media.`,
      )
    )
      return;
    setError("");
    const r = await fetch(`/api/ai-interviews/${row.id}/delete`, {
      method: "DELETE",
    });
    const d = await r.json();
    if (!r.ok) {
      setError(d.error || "Interview could not be deleted");
      return;
    }
    setRows((current) => current.filter((item) => item.id !== row.id));
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-7 w-7 text-blue-600" />
            <h1 className="text-2xl font-bold text-slate-950">AI Interviews</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Create secure browser interviews and review performance separately
            from integrity signals.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <Link
            href="/ai-interviews/create"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create AI interview
          </Link>
        </div>
      </div>
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Candidate</th>
              <th className="px-4 py-3">Job</th>
              <th className="px-4 py-3">Interview</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Integrity</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--ats-border)]">
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-[var(--ats-text-muted)]"
                >
                  Loading AI interviews...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8">
                  <div className="mx-auto flex max-w-sm flex-col items-center justify-center text-center rounded-2xl border border-dashed border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500 mb-4 dark:bg-slate-800">
                      <BrainCircuit className="h-6 w-6" />
                    </div>
                    <h3 className="font-display font-semibold text-[var(--ats-text)] text-lg">
                      No AI interviews yet
                    </h3>
                    <p className="mt-2 text-sm text-[var(--ats-text-muted)]">
                      Create an AI interview to autonomously screen and evaluate
                      your candidates.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">
                      {row.candidate_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.candidate_email}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.job_title}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">
                      {row.title}
                    </div>
                    <div className="text-xs text-slate-500">
                      {row.question_count} questions · {row.duration_minutes}{" "}
                      min
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${badge(row.status)}`}
                    >
                      {row.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {row.overall_score == null
                      ? "—"
                      : `${Math.round(Number(row.overall_score))}%`}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                    {row.integrity_risk || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/ai-interviews/${row.id}`}
                        className="font-semibold text-blue-700 hover:text-blue-900"
                      >
                        Open
                      </Link>
                      {row.status === "COMPLETED" && (
                        <Link
                          href={`/ai-interviews/${row.id}/report`}
                          className="font-semibold text-emerald-700"
                        >
                          Report
                        </Link>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => void remove(row)}
                          aria-label={`Delete interview for ${row.candidate_name}`}
                          className="text-rose-600 hover:text-rose-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
