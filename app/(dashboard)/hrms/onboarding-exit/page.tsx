"use client";

import React from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import Toast from "@/components/Toast";
import { UI } from "@/lib/ui";
import { DatePicker } from "@/components/ui/DateTimeFields";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { apiFetchJson } from "@/lib/apiClient";

type WorkflowRow = {
  id: number;
  user_id: number;
  user_name: string;
  workflow_type: "onboarding" | "exit";
  status: string;
  checklist: Record<string, boolean>;
  resignation_reason?: string | null;
  notice_start_date?: string | null;
  notice_end_date?: string | null;
  final_settlement_status?: string | null;
};

const DEFAULT_ONBOARDING = {
  new_joiner_checklist: false,
  document_collection_status: false,
  asset_allocation_status: false,
  training_completion_status: false,
  hr_verification_status: false,
  joining_confirmation: false,
};

const DEFAULT_EXIT = {
  resignation_request: false,
  notice_period_tracking: false,
  exit_checklist: false,
  asset_return_status: false,
  final_settlement_status: false,
  hr_exit_approval: false,
};

type OperationFeedback = {
  operation_status?: "success" | "partial" | "blocked" | "error";
  user_message?: string;
};

function checklistLabel(key: string) {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (part) => part.toUpperCase());
}

export default function OnboardingExitPage() {
  const [workflowType, setWorkflowType] = React.useState<"onboarding" | "exit">("onboarding");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "in_progress" | "closed">("all");
  const [userId, setUserId] = React.useState("");
  const [resignationReason, setResignationReason] = React.useState("");
  const [noticeStartDate, setNoticeStartDate] = React.useState("");
  const [noticeEndDate, setNoticeEndDate] = React.useState("");
  const [toast, setToast] = React.useState<{ message: string; variant: "success" | "error" | "blocked" } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const usersSwr = useSWR<{ employees: Array<{ id: number; full_name: string; email: string }> }>("/api/hrms/employees", dashboardFetcher, {
    revalidateOnFocus: false,
  });
  const workflowsSwr = useSWR<{ workflows: WorkflowRow[] }>(`/api/hrms/onboarding-exit?type=${workflowType}`, dashboardFetcher, {
    revalidateOnFocus: false,
  });

  function feedbackToVariant(feedback?: OperationFeedback) {
    if (feedback?.operation_status === "blocked") return "blocked" as const;
    if (feedback?.operation_status === "error") return "error" as const;
    return "success" as const;
  }

  async function createWorkflow() {
    if (!userId) return setToast({ message: "Select employee.", variant: "blocked" });
    setBusy(true);
    try {
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/onboarding-exit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: Number(userId),
          workflowType,
          checklist: workflowType === "onboarding" ? DEFAULT_ONBOARDING : DEFAULT_EXIT,
          resignationReason: workflowType === "exit" ? resignationReason || null : null,
          noticeStartDate: workflowType === "exit" ? noticeStartDate || null : null,
          noticeEndDate: workflowType === "exit" ? noticeEndDate || null : null,
        }),
      });
      setToast({ message: response.user_message || "Workflow created.", variant: feedbackToVariant(response) });
      setResignationReason("");
      setNoticeStartDate("");
      setNoticeEndDate("");
      await workflowsSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to create workflow.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function markDecision(row: WorkflowRow, decision: "approved" | "rejected") {
    setBusy(true);
    try {
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/onboarding-exit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, status: decision === "approved" ? "closed" : "in_progress", decision }),
      });
      setToast({ message: response.user_message || `Workflow ${decision}.`, variant: feedbackToVariant(response) });
      await workflowsSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to update workflow.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleChecklist(row: WorkflowRow, key: string) {
    const nextChecklist = { ...(row.checklist || {}), [key]: !Boolean((row.checklist || {})[key]) };
    setBusy(true);
    try {
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/onboarding-exit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, checklist: nextChecklist }),
      });
      setToast({ message: response.user_message || "Checklist updated.", variant: feedbackToVariant(response) });
      await workflowsSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to update checklist.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const rows = React.useMemo(() => {
    const all = workflowsSwr.data?.workflows || [];
    if (statusFilter === "all") return all;
    return all.filter((row) => row.status === statusFilter);
  }, [workflowsSwr.data?.workflows, statusFilter]);

  return (
    <AccessGate permissionKey="onboarding_exit.view_self">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={1800} /> : null}
      <ModulePageFrame title="Onboarding & Exit Management" subtitle="Track joining and separation workflows with checklist progress and approvals.">
        <section className={UI.card + " p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Create workflow</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <select className={UI.select} value={workflowType} onChange={(e) => setWorkflowType(e.target.value as "onboarding" | "exit")}>
              <option value="onboarding">Onboarding</option>
              <option value="exit">Exit</option>
            </select>
            <select className={UI.select} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Select employee</option>
              {(usersSwr.data?.employees || []).map((employee) => (
                <option key={employee.id} value={String(employee.id)}>
                  {employee.full_name} ({employee.email})
                </option>
              ))}
            </select>
            <DatePicker value={noticeStartDate} onChange={setNoticeStartDate} placeholder="Notice start date" />
            <DatePicker value={noticeEndDate} onChange={setNoticeEndDate} min={noticeStartDate} placeholder="Notice end date" />
          </div>
          {workflowType === "exit" ? (
            <input
              className={UI.input + " mt-3"}
              placeholder="Resignation reason"
              value={resignationReason}
              onChange={(e) => setResignationReason(e.target.value)}
            />
          ) : null}
          <button type="button" className={UI.primaryButton + " mt-4 py-2 text-sm"} onClick={() => void createWorkflow()} disabled={busy}>
            Create workflow
          </button>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[var(--ats-text)]">Workflows</h2>
            <select className={UI.select + " w-[180px]"} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "in_progress" | "closed")}>
              <option value="all">All status</option>
              <option value="in_progress">In progress</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ats-text-muted)]">
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Notice period</th>
                  <th className="px-2 py-2">Checklist progress</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const checklistEntries = Object.entries(row.checklist || {});
                  const completedCount = checklistEntries.filter(([, value]) => Boolean(value)).length;
                  const totalCount = checklistEntries.length;
                  const noticeStart = row.notice_start_date ? new Date(row.notice_start_date) : null;
                  const noticeEnd = row.notice_end_date ? new Date(row.notice_end_date) : null;
                  const noticeDays =
                    noticeStart && noticeEnd
                      ? Math.max(0, Math.floor((noticeEnd.getTime() - noticeStart.getTime()) / (1000 * 60 * 60 * 24)) + 1)
                      : null;
                  return (
                    <tr key={row.id} className="border-t border-[var(--ats-border)] align-top">
                      <td className="px-2 py-2">{row.user_name}</td>
                      <td className="px-2 py-2 capitalize">{row.workflow_type}</td>
                      <td className="px-2 py-2 capitalize">{row.status}</td>
                      <td className="px-2 py-2">
                        {noticeDays == null
                          ? "-"
                          : `${String(row.notice_start_date).slice(0, 10)} to ${String(row.notice_end_date).slice(0, 10)} (${noticeDays} days)`}
                      </td>
                      <td className="px-2 py-2">
                        <div className="mb-2 text-xs text-[var(--ats-text-muted)]">
                          {completedCount}/{totalCount || 0} completed
                        </div>
                        <div className="grid gap-1">
                          {checklistEntries.map(([key, value]) => (
                            <label key={key} className="flex items-center gap-2 text-xs text-[var(--ats-text)]">
                              <input type="checkbox" checked={Boolean(value)} onChange={() => void toggleChecklist(row, key)} disabled={busy} />
                              <span>{checklistLabel(key)}</span>
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        {row.status !== "closed" ? (
                          <div className="flex gap-2">
                            <button type="button" className={UI.primaryButton + " py-1.5 text-xs"} onClick={() => void markDecision(row, "approved")} disabled={busy}>
                              Approve
                            </button>
                            <button type="button" className={UI.secondaryButton + " py-1.5 text-xs"} onClick={() => void markDecision(row, "rejected")} disabled={busy}>
                              Reject
                            </button>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-[var(--ats-text-muted)]">
                      No workflows found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </ModulePageFrame>
    </AccessGate>
  );
}
