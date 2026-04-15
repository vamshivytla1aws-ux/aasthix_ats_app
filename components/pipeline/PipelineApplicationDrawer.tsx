"use client";

import React from "react";
import Link from "next/link";
import { X, Calendar, ClipboardList, Mail, ExternalLink } from "lucide-react";

type Stage =
  | "Applied"
  | "Screening"
  | "Screening Failed"
  | "Interview"
  | "Selected"
  | "Rejected";

export type DrawerApplication = {
  id: number;
  candidate_id: number;
  stage: Stage;
  candidate_full_name: string;
  job_title: string;
  job_company?: string | null;
  interview_scheduled?: boolean | null;
  interview_datetime?: string | null;
  assigned_recruiter_name?: string | null;
  assigned_recruiter_user_id?: number | null;
  current_interview_round_order?: number | null;
  current_interview_round_label?: string | null;
  interview_round_total?: number | null;
  interview_substatus?: "scheduled" | "completed_followup" | "no_show" | "cancelled" | null;
};

function formatWhen(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

export default function PipelineApplicationDrawer({
  app,
  currentUserId,
  onClose,
  onSchedule,
  onReschedule,
  onDecision,
  onMarkCompleted,
  onMarkNoShow,
  onEmail,
}: {
  app: DrawerApplication | null;
  currentUserId?: number;
  onClose: () => void;
  onSchedule: () => void;
  onReschedule: () => void;
  onDecision: () => void;
  onMarkCompleted: () => void;
  onMarkNoShow: () => void;
  onEmail: () => void;
}) {
  if (!app) return null;

  const isInterview = app.stage === "Interview";

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[1px] dark:bg-black/60"
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pipeline-drawer-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-700">
          <div className="min-w-0">
            <h2 id="pipeline-drawer-title" className="text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">
              {app.candidate_full_name}
            </h2>
            <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-400" title={app.job_title}>
              {app.job_title}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-500" title={app.job_company || undefined}>
              {app.job_company || "Client N/A"}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 text-sm">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-900/60">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Owner</div>
            <div className="mt-1 text-slate-800 dark:text-slate-200">
              {app.assigned_recruiter_name ||
                (app.assigned_recruiter_user_id != null ? `User #${app.assigned_recruiter_user_id}` : "Unassigned")}
              {currentUserId != null && app.assigned_recruiter_user_id === currentUserId ? (
                <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                  You
                </span>
              ) : null}
            </div>
          </div>

          {isInterview ? (
            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Interview</div>
                <div className="mt-1 text-slate-800 dark:text-slate-200">
                  {app.current_interview_round_label || `Round ${app.current_interview_round_order ?? "—"}`}
                  {typeof app.interview_round_total === "number" && app.interview_round_total > 0
                    ? ` · ${app.current_interview_round_order ?? 0}/${app.interview_round_total}`
                    : null}
                </div>
                <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Slot: {formatWhen(app.interview_datetime)}
                </div>
                <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Status:{" "}
                  {app.interview_substatus === "completed_followup"
                    ? "Interview completed — follow up pending"
                    : app.interview_substatus === "no_show"
                      ? "No show"
                      : app.interview_substatus === "cancelled"
                        ? "Cancelled"
                        : app.interview_substatus === "scheduled"
                          ? "Scheduled"
                          : "Awaiting schedule / decision"}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-2">
            <Link
              href={`/candidates/${app.candidate_id}?application=${app.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-slate-800"
              onClick={onClose}
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              Open candidate profile
            </Link>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={() => {
                onEmail();
                onClose();
              }}
            >
              <Mail className="h-4 w-4 shrink-0" />
              Draft / send email
            </button>
            {isInterview ? (
              <>
                {app.interview_datetime ? (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => {
                      onReschedule();
                      onClose();
                    }}
                  >
                    <Calendar className="h-4 w-4 shrink-0" />
                    Reschedule interview
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-800 hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-200"
                    onClick={() => {
                      onSchedule();
                      onClose();
                    }}
                  >
                    <Calendar className="h-4 w-4 shrink-0" />
                    Schedule interview
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => {
                    onDecision();
                    onClose();
                  }}
                >
                  <ClipboardList className="h-4 w-4 shrink-0" />
                  Interview decision…
                </button>
                {app.interview_substatus !== "completed_followup" ? (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-semibold text-violet-800 hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-violet-800/60 dark:bg-violet-950/50 dark:text-violet-200"
                    onClick={() => {
                      onMarkCompleted();
                      onClose();
                    }}
                  >
                    <ClipboardList className="h-4 w-4 shrink-0" />
                    Mark completed
                  </button>
                ) : null}
                {app.interview_substatus !== "no_show" ? (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200"
                    onClick={() => {
                      onMarkNoShow();
                      onClose();
                    }}
                  >
                    <ClipboardList className="h-4 w-4 shrink-0" />
                    Mark no show
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
