"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { UI } from "@/lib/ui";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import Toast from "@/components/Toast";
import DispositionReasonModal from "@/components/DispositionReasonModal";
import { jobStatusRequiresDispositionReason } from "@/lib/dispositionRules";

type Job = {
  id: number;
  title: string;
  company: string;
  location: string;
  status: string;
  description?: string | null;
  vendor_id?: number | null;
  open_positions?: number | null;
  employment_type?: string | null;
  experience_requirement?: string | null;
};

type QuestionCategory = "technical" | "scenario" | "behavioral" | "hr";
type InterviewQuestion = {
  question_id?: number;
  category: QuestionCategory;
  question: string;
  sort_order?: number;
};

type Client = {
  id: number;
  name: string;
};

const JOB_DRAFT_KEY = "ats:jobform-draft-v1";

export default function JobForm({
  open,
  onClose,
  onCreated,
  mode = "create",
  initialJob = null,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (job: Job) => void;
  mode?: "create" | "edit";
  initialJob?: Job | null;
}) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState<"Open" | "Closed">("Open");
  const [description, setDescription] = useState("");
  const [vendorId, setVendorId] = useState<string>("");
  const [openPositions, setOpenPositions] = useState("1");
  const [employmentType, setEmploymentType] = useState("Full Time");
  const [experienceRequirement, setExperienceRequirement] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionGenerateBusy, setQuestionGenerateBusy] = useState(false);
  const [questionSaveMode, setQuestionSaveMode] = useState<"AI" | "RULE_BASED" | null>(null);
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error"; requestId?: string } | null>(null);
  const [jobCloseDispositionOpen, setJobCloseDispositionOpen] = useState(false);
  const [draftBanner, setDraftBanner] = useState<{ savedAt: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initialJob) {
      setTitle(initialJob.title || "");
      setCompany(initialJob.company || "");
      setLocation(initialJob.location || "");
      setStatus((initialJob.status as "Open" | "Closed") || "Open");
      setDescription(initialJob.description || "");
      setVendorId(initialJob.vendor_id ? String(initialJob.vendor_id) : "");
      setOpenPositions(String(initialJob.open_positions ?? 1));
      setEmploymentType(initialJob.employment_type || "Full Time");
      setExperienceRequirement(initialJob.experience_requirement || "");
      setQuestionSaveMode(null);
      return;
    }
    setTitle("");
    setCompany("");
    setLocation("");
    setStatus("Open");
    setDescription("");
    setVendorId("");
    setOpenPositions("1");
    setEmploymentType("Full Time");
    setExperienceRequirement("");
    setQuestionSaveMode(null);
    setInterviewQuestions([]);
  }, [open, mode, initialJob]);

  useEffect(() => {
    if (!open) return;
    if (mode !== "edit" || !initialJob?.id) return;
    let cancelled = false;
    (async () => {
      setQuestionsLoading(true);
      try {
        const data = await apiFetchJson<{ questions: InterviewQuestion[] }>(`/api/jobs/${initialJob.id}/interview-questions`);
        if (!cancelled) setInterviewQuestions(Array.isArray(data?.questions) ? data.questions : []);
      } catch {
        if (!cancelled) setInterviewQuestions([]);
      } finally {
        if (!cancelled) setQuestionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, initialJob?.id]);

  function addQuestion(category: QuestionCategory) {
    setInterviewQuestions((prev) => [...prev, { category, question: "", sort_order: prev.length + 1 }]);
  }

  function updateQuestion(index: number, next: string) {
    setInterviewQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, question: next } : q)));
  }

  function removeQuestion(index: number) {
    setInterviewQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  async function generateQuestionsForJobId(jobId?: number) {
    setQuestionGenerateBusy(true);
    setToast(null);
    try {
      const res = await apiFetchJson<{ generated_mode: "AI" | "RULE_BASED"; questions: InterviewQuestion[] }>(
        jobId ? `/api/jobs/${jobId}/interview-questions` : "/api/jobs/interview-questions/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description,
            employment_type: employmentType,
          }),
        }
      );
      setInterviewQuestions(res.questions || []);
      setQuestionSaveMode(res.generated_mode);
      setToast({ message: `Questions generated (${res.generated_mode}).`, variant: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate questions";
      const rid = err instanceof ApiError ? err.requestId : undefined;
      setToast({ message: msg, variant: "error", requestId: rid });
    } finally {
      setQuestionGenerateBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const v = await apiFetchJson<Client[]>("/api/clients");
        if (!cancelled) setClients(v);
      } catch {
        // ignore; client selection is optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  useEffect(() => {
    if (!open || mode !== "create") {
      setDraftBanner(null);
      return;
    }
    try {
      const raw = window.localStorage.getItem(JOB_DRAFT_KEY);
      if (!raw) {
        setDraftBanner(null);
        return;
      }
      const d = JSON.parse(raw) as Record<string, unknown>;
      const hasContent = Boolean(
        (typeof d.title === "string" && d.title.trim()) ||
          (typeof d.company === "string" && d.company.trim()) ||
          (typeof d.description === "string" && d.description.trim())
      );
      setDraftBanner(hasContent ? { savedAt: typeof d.savedAt === "string" ? d.savedAt : "" } : null);
    } catch {
      setDraftBanner(null);
    }
  }, [open, mode]);

  useEffect(() => {
    if (!open || mode !== "create") return;
    const t = window.setTimeout(() => {
      const hasContent =
        title.trim().length > 0 || company.trim().length > 0 || description.trim().length > 0;
      if (!hasContent) return;
      try {
        window.localStorage.setItem(
          JOB_DRAFT_KEY,
          JSON.stringify({
            title,
            company,
            location,
            description,
            vendorId,
            openPositions,
            employmentType,
            experienceRequirement,
            savedAt: new Date().toISOString(),
          })
        );
      } catch {
        /* ignore */
      }
    }, 900);
    return () => window.clearTimeout(t);
  }, [open, mode, title, company, location, description, vendorId, openPositions, employmentType, experienceRequirement]);

  function restoreJobDraft() {
    try {
      const raw = window.localStorage.getItem(JOB_DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, string>;
      if (typeof d.title === "string") setTitle(d.title);
      if (typeof d.company === "string") setCompany(d.company);
      if (typeof d.location === "string") setLocation(d.location);
      if (typeof d.description === "string") setDescription(d.description);
      if (typeof d.vendorId === "string") setVendorId(d.vendorId);
      if (typeof d.openPositions === "string") setOpenPositions(d.openPositions);
      if (typeof d.employmentType === "string") setEmploymentType(d.employmentType);
      if (typeof d.experienceRequirement === "string") setExperienceRequirement(d.experienceRequirement);
    } catch {
      /* ignore */
    }
    setDraftBanner(null);
  }

  function discardJobDraft() {
    try {
      window.localStorage.removeItem(JOB_DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setDraftBanner(null);
  }

  if (!open) return null;

  async function performSave(dispositionReasonId?: number) {
    setSubmitting(true);
    setToast(null);
    try {
      const endpoint = mode === "edit" && initialJob ? `/api/jobs/${initialJob.id}` : "/api/jobs";
      const method = mode === "edit" ? "PUT" : "POST";
      const positionsNum = Number(openPositions);
      if (!Number.isFinite(positionsNum) || positionsNum < 1) {
        setToast({ message: "Open positions must be at least 1", variant: "error" });
        setSubmitting(false);
        return;
      }
      const payload: Record<string, unknown> = {
        title,
        company,
        location,
        status,
        description: description || null,
        vendor_id: vendorId ? Number(vendorId) : null,
        open_positions: Math.trunc(positionsNum),
        employment_type: employmentType,
        experience_requirement: experienceRequirement.trim() || null,
      };
      if (dispositionReasonId != null) payload.disposition_reason_id = dispositionReasonId;

      const created = await apiFetchJson<Job>(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const validQuestions = interviewQuestions
        .map((q) => ({
          category: q.category,
          question: String(q.question || "").trim(),
          sort_order: q.sort_order,
        }))
        .filter((q) => q.question.length > 0);
      if (validQuestions.length > 0) {
        await apiFetchJson(`/api/jobs/${created.id}/interview-questions`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questions: validQuestions }),
        });
      }
      onCreated(created);
      if (mode === "create") {
        try {
          window.localStorage.removeItem(JOB_DRAFT_KEY);
        } catch {
          /* ignore */
        }
        setDraftBanner(null);
      }
      setToast({
        message: mode === "edit" ? "Job updated successfully." : "Job created successfully.",
        variant: "success",
      });
      setTitle("");
      setCompany("");
      setLocation("");
      setStatus("Open");
      setDescription("");
      setVendorId("");
      setOpenPositions("1");
      setEmploymentType("Full Time");
      setExperienceRequirement("");
      setInterviewQuestions([]);
      setQuestionSaveMode(null);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save job";
      const rid = err instanceof ApiError ? err.requestId : undefined;
      setToast({ message: msg, variant: "error", requestId: rid });
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "edit" && initialJob) {
      const prevSt = String(initialJob.status || "Open").trim();
      const nextSt = String(status).trim();
      if (jobStatusRequiresDispositionReason(nextSt) && nextSt !== prevSt) {
        setJobCloseDispositionOpen(true);
        return;
      }
    }
    await performSave();
  }

  return (
    <>
      <DispositionReasonModal
        open={jobCloseDispositionOpen}
        reasonSet="job_close"
        title="Job status change"
        description="This save moves the job to a closed / hold / filled–type status. Pick a reason for the audit log."
        confirmLabel="Save job"
        onClose={() => setJobCloseDispositionOpen(false)}
        onConfirm={async (reasonId) => {
          setJobCloseDispositionOpen(false);
          await performSave(reasonId);
        }}
      />
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          requestId={toast.requestId}
          onClose={() => setToast(null)}
          autoHideMs={toast.variant === "error" ? 5200 : 2500}
        />
      )}
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
        role="presentation"
      >
        <button
          type="button"
          aria-label="Close dialog"
          className="absolute inset-0 bg-black/40"
          onClick={() => !submitting && onClose()}
        />
        <div
          className="relative flex min-h-0 w-full max-w-2xl max-h-[min(92vh,calc(100dvh-1rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-form-title"
        >
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5 sm:py-4">
            <div className="min-w-0 pr-2">
              <h2 id="job-form-title" className="text-lg font-semibold text-slate-900">
                {mode === "edit" ? "Edit Job" : "Add Job"}
              </h2>
              <p className="text-sm text-slate-600">
                {mode === "edit" ? "Update role details." : "Create a new role in your workspace."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
              <div className="space-y-6">
              {mode === "create" && draftBanner ? (
                <div className="flex flex-col gap-2 rounded-xl border border-indigo-200 bg-indigo-50/90 px-4 py-3 text-sm text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Unsaved draft{draftBanner.savedAt ? ` · saved ${new Date(draftBanner.savedAt).toLocaleString()}` : ""}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={UI.secondaryButton + " py-1.5 text-xs"} onClick={restoreJobDraft}>
                      Restore draft
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 dark:border-indigo-600 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
                      onClick={discardJobDraft}
                    >
                      Discard
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className={UI.label}>Title</label>
                  <input className={UI.input} value={title} onChange={(e) => setTitle(e.target.value)} required />
                  <p className="mt-1 text-xs text-slate-500">Use the same title hiring managers see on requisitions and reports.</p>
                </div>
                <div>
                  <label className={UI.label}>Company</label>
                  <input className={UI.input} value={company} onChange={(e) => setCompany(e.target.value)} required />
                  <p className="mt-1 text-xs text-slate-500">
                    Must match your client / legal entity naming for compliance and client-facing exports.
                  </p>
                </div>
                <div>
                  <label className={UI.label}>Location</label>
                  <input className={UI.input} value={location} onChange={(e) => setLocation(e.target.value)} required />
                </div>
                <div>
                  <label className={UI.label}>Open Positions</label>
                  <input
                    inputMode="numeric"
                    className={UI.input}
                    value={openPositions}
                    onChange={(e) => setOpenPositions(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className={UI.label}>Employment Type</label>
                  <select className={UI.select} value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                    <option value="Full Time">Full Time</option>
                    <option value="Part Time">Part Time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                    <option value="Freelance">Freelance</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className={UI.label}>Experience (public careers table)</label>
                  <input
                    className={UI.input}
                    value={experienceRequirement}
                    onChange={(e) => setExperienceRequirement(e.target.value)}
                    placeholder="e.g. 4–6 years in backend / product engineering"
                  />
                  <p className="mt-1 text-xs text-slate-500">Shown on the public careers page &amp; job description modal.</p>
                </div>
                <div>
                  <label className={UI.label}>Client</label>
                  <select
                    className={UI.select}
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    disabled={submitting}
                  >
                    <option value="">None</option>
                    {clients.map((v) => (
                      <option key={v.id} value={String(v.id)}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={UI.label}>Status</label>
                  <select className={UI.select} value={status} onChange={(e) => setStatus(e.target.value as any)}>
                    <option value="Open">Open</option>
                    <option value="Closed">Closed</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className={UI.label}>Description</label>
                  <textarea
                    className={[UI.input, "min-h-[110px] resize-y"].join(" ")}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Role overview, requirements, etc."
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Avoid discriminatory language; focus on skills, scope, and qualifications required for the role.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">AI Interview Questions</div>
                    <div className="text-xs text-slate-600">
                      Generate and edit structured interview questions for this job profile.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => generateQuestionsForJobId(mode === "edit" ? initialJob?.id : undefined)}
                    disabled={questionGenerateBusy || submitting}
                    className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {questionGenerateBusy ? "Generating..." : "Generate Questions (AI)"}
                  </button>
                </div>
                {questionSaveMode ? (
                  <div className="mt-2 text-xs font-medium text-indigo-700">Generated Mode: {questionSaveMode}</div>
                ) : null}
                {questionsLoading ? <div className="mt-3 text-xs text-slate-500">Loading questions...</div> : null}
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {(["technical", "scenario", "behavioral", "hr"] as QuestionCategory[]).map((category) => (
                    <div key={category} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">{category}</div>
                        <button
                          type="button"
                          onClick={() => addQuestion(category)}
                          className="text-xs text-blue-700 hover:underline"
                        >
                          + Add
                        </button>
                      </div>
                      <div className="mt-2 space-y-2">
                        {interviewQuestions
                          .map((q, idx) => ({ ...q, idx }))
                          .filter((q) => q.category === category)
                          .map((item) => (
                            <div key={`${category}-${item.idx}`} className="flex items-start gap-2">
                              <textarea
                                className={[UI.input, "min-h-[62px]"].join(" ")}
                                value={item.question}
                                onChange={(e) => updateQuestion(item.idx, e.target.value)}
                                placeholder="Add interview question..."
                              />
                              <button
                                type="button"
                                onClick={() => removeQuestion(item.idx)}
                                className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                              >
                                Delete
                              </button>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => !submitting && onClose()}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 transition-all duration-200"
                disabled={submitting}
              >
                Cancel
              </button>
              <button type="submit" disabled={submitting} className={UI.primaryButton}>
                {submitting && (
                  <span
                    className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"
                    aria-hidden="true"
                  />
                )}
                {submitting ? (mode === "edit" ? "Saving..." : "Creating...") : mode === "edit" ? "Save Changes" : "Create Job"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

