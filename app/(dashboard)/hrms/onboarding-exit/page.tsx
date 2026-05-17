"use client";

import React from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import Toast from "@/components/Toast";
import { UI } from "@/lib/ui";
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

export default function OnboardingExitPage() {
  const [workflowType, setWorkflowType] = React.useState<"onboarding" | "exit">("onboarding");
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

  async function createWorkflow() {
    if (!userId) return setToast({ message: "Select employee.", variant: "blocked" });
    setBusy(true);
    try {
      await apiFetchJson("/api/hrms/onboarding-exit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: Number(userId),
          workflowType,
          checklist: workflowType === "onboarding" ? DEFAULT_ONBOARDING : DEFAULT_EXIT,
          resignationReason: resignationReason || null,
          noticeStartDate: noticeStartDate || null,
          noticeEndDate: noticeEndDate || null,
        }),
      });
      setToast({ message: "Workflow created.", variant: "success" });
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
      await apiFetchJson("/api/hrms/onboarding-exit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, status: decision === "approved" ? "closed" : "in_progress", decision }),
      });
      setToast({ message: `Workflow ${decision}.`, variant: "success" });
      await workflowsSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to update workflow.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const rows = workflowsSwr.data?.workflows || [];

  return (
    <AccessGate permissionKey="onboarding_exit.view_self">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={1800} /> : null}
      <ModulePageFrame title="Onboarding & Exit Management" subtitle="Manage employee joining and separation workflows with checklist visibility and approvals.">
        <section className={UI.card + " p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Create workflow</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <select className={UI.select} value={workflowType} onChange={(e) => setWorkflowType(e.target.value as any)}>
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
            <input className={UI.input} placeholder="Notice start date" type="date" value={noticeStartDate} onChange={(e) => setNoticeStartDate(e.target.value)} />
            <input className={UI.input} placeholder="Notice end date" type="date" value={noticeEndDate} onChange={(e) => setNoticeEndDate(e.target.value)} />
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
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Workflows</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ats-text-muted)]">
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Checklist</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--ats-border)]">
                    <td className="px-2 py-2">{row.user_name}</td>
                    <td className="px-2 py-2 capitalize">{row.workflow_type}</td>
                    <td className="px-2 py-2 capitalize">{row.status}</td>
                    <td className="px-2 py-2">{Object.entries(row.checklist || {}).filter(([, v]) => Boolean(v)).length} completed</td>
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
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-4 text-center text-[var(--ats-text-muted)]">
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
