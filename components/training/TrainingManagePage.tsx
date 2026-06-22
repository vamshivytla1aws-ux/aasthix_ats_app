"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, RefreshCcw, Save } from "lucide-react";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import ModuleDataTable, { type ModuleDataTableColumn } from "@/components/enterprise/ModuleDataTable";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";
import type { TrainingAnswer, TrainingAnswerAnalysis, TrainingQuestion } from "@/lib/trainingQuestions";

type TrainingSubmissionListRow = {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  source: string;
  review_status: string;
  resume_parse_status: string;
  question_generation_status: string;
  answer_analysis_status: string;
  generated_mode: string;
  answer_analysis_mode: string | null;
  resume_url: string | null;
  resume_file_name: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
  answers_submitted_at: string | null;
  question_count: number;
  answer_count: number;
};

type TrainingSubmissionDetail = TrainingSubmissionListRow & {
  created_by_user_id: number | null;
  consent_accepted: boolean;
  resume_text: string | null;
  resume_parse_error: string | null;
  question_generation_error: string | null;
  answer_analysis_error: string | null;
  overall_answer_score: number | null;
  answer_summary: string | null;
  reviewer_notes: string | null;
  generated_questions: TrainingQuestion[];
  trainee_answers: TrainingAnswer[];
  answer_analyses: TrainingAnswerAnalysis[];
  session_id: string | null;
};

const REVIEW_OPTIONS = ["new", "in_review", "reviewed", "contacted", "archived"] as const;

function prettyStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function TrainingManagePage() {
  const [rows, setRows] = useState<TrainingSubmissionListRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TrainingSubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string>("new");
  const [reviewerNotes, setReviewerNotes] = useState("");

  async function loadList() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson<{ submissions: TrainingSubmissionListRow[] }>("/api/training/submissions");
      const list = Array.isArray(data.submissions) ? data.submissions : [];
      setRows(list);
      setSelectedId((current) => current ?? list[0]?.id ?? null);
    } catch (loadError) {
      setError((loadError as Error)?.message || "Failed to load training submissions");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: number) {
    setDetailLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson<{ submission: TrainingSubmissionDetail }>(`/api/training/submissions/${id}`);
      setDetail(data.submission);
      setReviewStatus(data.submission.review_status);
      setReviewerNotes(data.submission.reviewer_notes || "");
    } catch (loadError) {
      setError((loadError as Error)?.message || "Failed to load submission detail");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void loadList();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId]);

  const columns = useMemo<ModuleDataTableColumn<TrainingSubmissionListRow>[]>(() => [
    {
      id: "submitted_at",
      header: "Submitted",
      defaultWidth: 170,
      csvValue: (row) => row.submitted_at,
      sortValue: (row) => row.submitted_at,
      cell: (row) => (
        <button type="button" className="text-left font-medium text-[var(--ats-primary)] hover:underline" onClick={() => setSelectedId(row.id)}>
          {new Date(row.submitted_at).toLocaleString("en-IN")}
        </button>
      ),
    },
    {
      id: "full_name",
      header: "Trainee",
      defaultWidth: 180,
      csvValue: (row) => row.full_name,
      sortValue: (row) => row.full_name,
      cell: (row) => <span className="font-medium text-[var(--ats-text)]">{row.full_name}</span>,
    },
    {
      id: "contact",
      header: "Contact",
      defaultWidth: 220,
      csvValue: (row) => `${row.email} ${row.phone}`,
      cell: (row) => (
        <div>
          <div>{row.email}</div>
          <div className="text-xs text-[var(--ats-text-muted)]">{row.phone}</div>
        </div>
      ),
    },
    {
      id: "questions",
      header: "Questions",
      defaultWidth: 120,
      csvValue: (row) => String(row.question_count),
      sortValue: (row) => row.question_count,
      align: "center",
      cell: (row) => <span>{row.question_count}</span>,
    },
    {
      id: "generation",
      header: "Generation",
      defaultWidth: 160,
      csvValue: (row) => `${row.generated_mode} ${row.question_generation_status}`,
      cell: (row) => (
        <div>
          <div>{row.generated_mode}</div>
          <div className="text-xs text-[var(--ats-text-muted)]">{prettyStatus(row.question_generation_status)}</div>
        </div>
      ),
    },
    {
      id: "answers",
      header: "Answers",
      defaultWidth: 160,
      csvValue: (row) => `${row.answer_count} ${row.answer_analysis_status}`,
      cell: (row) => (
        <div>
          <div>{row.answer_count} submitted</div>
          <div className="text-xs text-[var(--ats-text-muted)]">{prettyStatus(row.answer_analysis_status)}</div>
        </div>
      ),
    },
    {
      id: "review_status",
      header: "Review",
      defaultWidth: 140,
      csvValue: (row) => row.review_status,
      sortValue: (row) => row.review_status,
      cell: (row) => <span>{prettyStatus(row.review_status)}</span>,
    },
  ], []);

  async function saveReview() {
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      const data = await apiFetchJson<{ submission: TrainingSubmissionDetail }>(`/api/training/submissions/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_status: reviewStatus,
          reviewer_notes: reviewerNotes,
        }),
      });
      setDetail(data.submission);
      setRows((current) => current.map((row) => (row.id === data.submission.id ? data.submission : row)));
    } catch (saveError) {
      setError((saveError as Error)?.message || "Failed to save review");
    } finally {
      setSaving(false);
    }
  }

  async function regenerateQuestions() {
    if (!detail) return;
    setRegenerating(true);
    setError(null);
    try {
      const data = await apiFetchJson<{ submission: TrainingSubmissionDetail }>(
        `/api/training/submissions/${detail.id}/regenerate-questions`,
        { method: "POST" }
      );
      setDetail(data.submission);
      setRows((current) => current.map((row) => (row.id === data.submission.id ? data.submission : row)));
    } catch (regenError) {
      setError((regenError as Error)?.message || "Failed to regenerate questions");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <ModulePageFrame
      title="Training Module"
      subtitle="Review public training submissions, generated questions, trainee answers, and answer analysis."
      metrics={
        <>
          <span>{rows.length} submissions</span>
          <span className="rounded-full bg-[color:rgb(255_255_255_/_0.72)] px-3 py-1 text-xs text-[var(--ats-text-muted)]">
            Public link: /training
          </span>
        </>
      }
      actions={
        <Link href="/training" target="_blank" className={UI.secondaryButton}>
          <ExternalLink className="h-4 w-4" />
          Open public link
        </Link>
      }
      banner={
        error ? <div className="text-sm text-rose-600">{error}</div> : <div className="text-sm text-[var(--ats-text-muted)]">Training submissions stay separate from ATS candidates in this module.</div>
      }
    >
      {loading ? (
        <div className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-6 text-sm text-[var(--ats-text-muted)]">
          Loading training submissions…
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <ModuleDataTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={columns}
            storageKey="training-module-table"
            exportBasename="training-submissions"
            emptyMessage="No training submissions yet."
          />

          <section className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-5 shadow-[var(--ats-shadow-sm)]">
            {!selectedId ? (
              <div className="text-sm text-[var(--ats-text-muted)]">Select a submission to view details.</div>
            ) : detailLoading ? (
              <div className="text-sm text-[var(--ats-text-muted)]">Loading submission details…</div>
            ) : detail ? (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--ats-text)]">{detail.full_name}</h2>
                    <p className="text-sm text-[var(--ats-text-muted)]">
                      {detail.email} · {detail.phone}
                    </p>
                  </div>
                  <a
                    href={`/api/training/submissions/${detail.id}/resume`}
                    target="_blank"
                    rel="noreferrer"
                    className={UI.secondaryButton}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open resume
                  </a>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoCard label="Review status" value={prettyStatus(detail.review_status)} />
                  <InfoCard label="Generation mode" value={`${detail.generated_mode} · ${prettyStatus(detail.question_generation_status)}`} />
                  <InfoCard label="Resume parse" value={prettyStatus(detail.resume_parse_status)} />
                  <InfoCard label="Question count" value={String(detail.generated_questions.length)} />
                  <InfoCard
                    label="Answer analysis"
                    value={`${prettyStatus(detail.answer_analysis_status)}${detail.answer_analysis_mode ? ` · ${detail.answer_analysis_mode}` : ""}`}
                  />
                  <InfoCard
                    label="Overall answer score"
                    value={detail.overall_answer_score == null ? "Pending" : `${detail.overall_answer_score}/15`}
                  />
                </div>

                {detail.resume_parse_error ? (
                  <div className="rounded-xl border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Resume parse note: {detail.resume_parse_error}
                  </div>
                ) : null}
                {detail.question_generation_error ? (
                  <div className="rounded-xl border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Question generation note: {detail.question_generation_error}
                  </div>
                ) : null}
                {detail.answer_analysis_error ? (
                  <div className="rounded-xl border border-amber-300/50 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    Answer analysis note: {detail.answer_analysis_error}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[var(--ats-text-muted)]">Review status</label>
                  <select
                    value={reviewStatus}
                    onChange={(e) => setReviewStatus(e.target.value)}
                    className="w-full rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg)] px-3 py-2 text-sm text-[var(--ats-text)]"
                  >
                    {REVIEW_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {prettyStatus(option)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[var(--ats-text-muted)]">Reviewer notes</label>
                  <textarea
                    rows={4}
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    className="w-full rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg)] px-3 py-2 text-sm text-[var(--ats-text)]"
                    placeholder="Internal notes for the training review..."
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={saveReview} disabled={saving} className={UI.primaryButton}>
                    <Save className="h-4 w-4" />
                    {saving ? "Saving..." : "Save review"}
                  </button>
                  <button type="button" onClick={regenerateQuestions} disabled={regenerating} className={UI.secondaryButton}>
                    <RefreshCcw className="h-4 w-4" />
                    {regenerating ? "Regenerating..." : "Regenerate questions"}
                  </button>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-[var(--ats-text)]">Generated questions</h3>
                  <div className="mt-3 space-y-3">
                    {detail.generated_questions.map((question, index) => (
                      <div key={`${question.category}-${index}`} className="rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg)] px-3 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ats-primary)]">
                          {prettyStatus(question.category)}
                        </div>
                        <p className="mt-1 text-sm font-medium text-[var(--ats-text)]">{question.question}</p>
                        {question.reference_answer ? (
                          <p className="mt-2 text-xs leading-5 text-[var(--ats-text-muted)]">{question.reference_answer}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-[var(--ats-text)]">Trainee answers</h3>
                  {detail.answers_submitted_at ? (
                    <p className="mt-1 text-xs text-[var(--ats-text-muted)]">
                      Submitted on {new Date(detail.answers_submitted_at).toLocaleString("en-IN")}
                    </p>
                  ) : null}
                  <div className="mt-3 space-y-3">
                    {detail.trainee_answers.length ? (
                      detail.trainee_answers.map((answer, index) => (
                        <div key={`${answer.category}-${index}`} className="rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg)] px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ats-primary)]">
                            {prettyStatus(answer.category)}
                          </div>
                          <p className="mt-1 text-sm font-medium text-[var(--ats-text)]">{answer.question}</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--ats-text-muted)]">
                            {answer.answer?.trim() || "No answer submitted."}
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-[var(--ats-border)] px-3 py-4 text-sm text-[var(--ats-text-muted)]">
                        No trainee answers submitted yet.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-[var(--ats-text)]">Answer analysis</h3>
                  {detail.answer_summary ? (
                    <p className="mt-2 text-sm leading-6 text-[var(--ats-text-muted)]">{detail.answer_summary}</p>
                  ) : null}
                  <div className="mt-3 space-y-3">
                    {detail.answer_analyses.length ? (
                      detail.answer_analyses.map((analysis, index) => (
                        <div key={`${analysis.category}-${index}`} className="rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg)] px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ats-primary)]">
                              {prettyStatus(analysis.category)}
                            </div>
                            <div className="text-sm font-semibold text-[var(--ats-text)]">{analysis.score}%</div>
                          </div>
                          <p className="mt-1 text-sm font-medium text-[var(--ats-text)]">{analysis.question}</p>
                          <p className="mt-2 text-sm leading-6 text-[var(--ats-text-muted)]">{analysis.summary}</p>
                          {analysis.strengths.length ? (
                            <p className="mt-2 text-xs leading-5 text-emerald-700">
                              Strengths: {analysis.strengths.join(" · ")}
                            </p>
                          ) : null}
                          {analysis.improvements.length ? (
                            <p className="mt-2 text-xs leading-5 text-amber-700">
                              Improve: {analysis.improvements.join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-[var(--ats-border)] px-3 py-4 text-sm text-[var(--ats-text-muted)]">
                        Answer analysis has not been generated yet.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-[var(--ats-text)]">Resume text excerpt</h3>
                  <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg)] px-3 py-3 text-sm leading-6 text-[var(--ats-text-muted)]">
                    {detail.resume_text?.trim() || "Resume text was not available."}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-[var(--ats-text-muted)]">Submission not found.</div>
            )}
          </section>
        </div>
      )}
    </ModulePageFrame>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg)] px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ats-text-muted)]">{label}</div>
      <div className="mt-1 text-sm font-medium text-[var(--ats-text)]">{value}</div>
    </div>
  );
}

