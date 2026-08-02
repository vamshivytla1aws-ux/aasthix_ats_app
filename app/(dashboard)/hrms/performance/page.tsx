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

type Cycle = { id: number; name: string; start_date: string; end_date: string; status: string };
type Goal = {
  id: number;
  cycle_id: number;
  employee_id: number;
  employee_name: string;
  title: string;
  description: string;
  weight_percent: number;
};
type Review = {
  id: number;
  cycle_id: number;
  cycle_name: string;
  employee_id: number;
  employee_name: string;
  rating: number | null;
  recommendation: string | null;
  status: string;
};

type OperationFeedback = {
  operation_status?: "success" | "partial" | "blocked" | "error";
  user_message?: string;
};

export default function PerformancePage() {
  const [cycleName, setCycleName] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [selectedCycleId, setSelectedCycleId] = React.useState("");
  const [employeeId, setEmployeeId] = React.useState("");
  const [goalTitle, setGoalTitle] = React.useState("");
  const [goalDescription, setGoalDescription] = React.useState("");
  const [goalWeight, setGoalWeight] = React.useState("");
  const [rating, setRating] = React.useState("");
  const [recommendation, setRecommendation] = React.useState("");
  const [selfReview, setSelfReview] = React.useState("");
  const [managerReview, setManagerReview] = React.useState("");
  const [hrReview, setHrReview] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<{ message: string; variant: "success" | "error" | "blocked" } | null>(null);

  const employeesSwr = useSWR<{ employees: Array<{ id: number; full_name: string; email: string }> }>("/api/hrms/employees", dashboardFetcher, {
    revalidateOnFocus: false,
  });
  const perfSwr = useSWR<{ cycles: Cycle[]; reviews: Review[]; goals: Goal[] }>(
    selectedCycleId ? `/api/hrms/performance?cycleId=${selectedCycleId}` : "/api/hrms/performance",
    dashboardFetcher,
    { revalidateOnFocus: false },
  );

  function feedbackToVariant(feedback?: OperationFeedback) {
    if (feedback?.operation_status === "blocked") return "blocked" as const;
    if (feedback?.operation_status === "error") return "error" as const;
    return "success" as const;
  }

  async function createCycle() {
    if (!cycleName.trim() || !startDate || !endDate) {
      setToast({ message: "Cycle name, start date, and end date are required.", variant: "blocked" });
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "cycle", name: cycleName.trim(), startDate, endDate }),
      });
      setCycleName("");
      setStartDate("");
      setEndDate("");
      setToast({ message: response.user_message || "Performance cycle created.", variant: feedbackToVariant(response) });
      await perfSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to create cycle.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function createGoal() {
    if (!selectedCycleId || !employeeId || !goalTitle.trim() || !goalDescription.trim()) {
      setToast({ message: "Cycle, employee, goal title and description are required.", variant: "blocked" });
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "goal",
          cycleId: Number(selectedCycleId),
          employeeId: Number(employeeId),
          title: goalTitle.trim(),
          description: goalDescription.trim(),
          weightPercent: Number(goalWeight || 0),
        }),
      });
      setGoalTitle("");
      setGoalDescription("");
      setGoalWeight("");
      setToast({ message: response.user_message || "Performance goal created.", variant: feedbackToVariant(response) });
      await perfSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to create goal.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function saveReview() {
    if (!selectedCycleId || !employeeId) {
      setToast({ message: "Select cycle and employee.", variant: "blocked" });
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetchJson<OperationFeedback>("/api/hrms/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "review",
          cycleId: Number(selectedCycleId),
          employeeId: Number(employeeId),
          selfReview: { feedback: selfReview || "" },
          managerReview: { feedback: managerReview || "" },
          hrReview: { feedback: hrReview || "", recommendation: recommendation || "" },
          rating: rating ? Number(rating) : null,
          recommendation: recommendation || null,
          status: "hr_reviewed",
        }),
      });
      setRating("");
      setRecommendation("");
      setSelfReview("");
      setManagerReview("");
      setHrReview("");
      setToast({ message: response.user_message || "Performance review saved.", variant: feedbackToVariant(response) });
      await perfSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to save review.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const cycles = perfSwr.data?.cycles || [];
  const reviews = perfSwr.data?.reviews || [];
  const goals = perfSwr.data?.goals || [];

  return (
    <AccessGate permissionKey="performance.view_self">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={1800} /> : null}
      <ModulePageFrame title="Performance Management" subtitle="Manage KPI cycles, goals, multi-stage reviews, ratings, and recommendations.">
        <section className={UI.card + " p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Create appraisal cycle</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <input className={UI.input} placeholder="Cycle name (e.g., FY 26 H1)" value={cycleName} onChange={(e) => setCycleName(e.target.value)} />
            <DatePicker value={startDate} onChange={setStartDate} aria-label="Review cycle start date" />
            <DatePicker value={endDate} onChange={setEndDate} min={startDate} aria-label="Review cycle end date" />
            <button type="button" className={UI.primaryButton + " py-2 text-sm"} onClick={() => void createCycle()} disabled={busy}>
              Create cycle
            </button>
          </div>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Create goal / KPI</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <select className={UI.select} value={selectedCycleId} onChange={(e) => setSelectedCycleId(e.target.value)}>
              <option value="">Select cycle</option>
              {cycles.map((cycle) => (
                <option key={cycle.id} value={String(cycle.id)}>
                  {cycle.name}
                </option>
              ))}
            </select>
            <select className={UI.select} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select employee</option>
              {(employeesSwr.data?.employees || []).map((employee) => (
                <option key={employee.id} value={String(employee.id)}>
                  {employee.full_name} ({employee.email})
                </option>
              ))}
            </select>
            <input className={UI.input} placeholder="Goal title" value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} />
            <input className={UI.input} type="number" min={0} max={100} step="0.1" placeholder="Weight %" value={goalWeight} onChange={(e) => setGoalWeight(e.target.value)} />
            <textarea
              className={UI.input + " min-h-[92px] md:col-span-4"}
              placeholder="Goal description / KPI criteria"
              value={goalDescription}
              onChange={(e) => setGoalDescription(e.target.value)}
            />
          </div>
          <button type="button" className={UI.secondaryButton + " mt-4 py-2 text-sm"} onClick={() => void createGoal()} disabled={busy}>
            Add goal
          </button>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Submit review</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <textarea className={UI.input + " min-h-[96px]"} placeholder="Employee self review" value={selfReview} onChange={(e) => setSelfReview(e.target.value)} />
            <textarea className={UI.input + " min-h-[96px]"} placeholder="Manager review" value={managerReview} onChange={(e) => setManagerReview(e.target.value)} />
            <textarea className={UI.input + " min-h-[96px]"} placeholder="HR review" value={hrReview} onChange={(e) => setHrReview(e.target.value)} />
            <div className="grid gap-3">
              <input className={UI.input} type="number" min={1} max={5} step="0.1" placeholder="Rating (1-5)" value={rating} onChange={(e) => setRating(e.target.value)} />
              <input className={UI.input} placeholder="Recommendation / increment note" value={recommendation} onChange={(e) => setRecommendation(e.target.value)} />
              <button type="button" className={UI.primaryButton + " py-2 text-sm"} onClick={() => void saveReview()} disabled={busy}>
                Save review
              </button>
            </div>
          </div>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Goal library</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ats-text-muted)]">
                  <th className="px-2 py-2">Cycle</th>
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2">Title</th>
                  <th className="px-2 py-2">Weight</th>
                </tr>
              </thead>
              <tbody>
                {goals.map((goal) => (
                  <tr key={goal.id} className="border-t border-[var(--ats-border)]">
                    <td className="px-2 py-2">{cycles.find((cycle) => cycle.id === goal.cycle_id)?.name || "-"}</td>
                    <td className="px-2 py-2">{goal.employee_name}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium text-[var(--ats-text)]">{goal.title}</div>
                      <div className="text-xs text-[var(--ats-text-muted)]">{goal.description}</div>
                    </td>
                    <td className="px-2 py-2">{Number(goal.weight_percent || 0).toFixed(1)}%</td>
                  </tr>
                ))}
                {goals.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-center text-[var(--ats-text-muted)]">
                      No goals found for this cycle.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Review history</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--ats-text-muted)]">
                  <th className="px-2 py-2">Cycle</th>
                  <th className="px-2 py-2">Employee</th>
                  <th className="px-2 py-2">Rating</th>
                  <th className="px-2 py-2">Recommendation</th>
                  <th className="px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((review) => (
                  <tr key={review.id} className="border-t border-[var(--ats-border)]">
                    <td className="px-2 py-2">{review.cycle_name}</td>
                    <td className="px-2 py-2">{review.employee_name}</td>
                    <td className="px-2 py-2">{review.rating == null ? "-" : Number(review.rating).toFixed(1)}</td>
                    <td className="px-2 py-2">{review.recommendation || "-"}</td>
                    <td className="px-2 py-2 capitalize">{review.status}</td>
                  </tr>
                ))}
                {reviews.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-4 text-center text-[var(--ats-text-muted)]">
                      No performance reviews found.
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
