"use client";

import React from "react";
import useSWR from "swr";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import Toast from "@/components/Toast";
import { UI } from "@/lib/ui";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { apiFetchJson } from "@/lib/apiClient";

type Cycle = { id: number; name: string; start_date: string; end_date: string; status: string };
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

export default function PerformancePage() {
  const [cycleName, setCycleName] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [selectedCycleId, setSelectedCycleId] = React.useState("");
  const [employeeId, setEmployeeId] = React.useState("");
  const [rating, setRating] = React.useState("");
  const [recommendation, setRecommendation] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<{ message: string; variant: "success" | "error" | "blocked" } | null>(null);

  const employeesSwr = useSWR<{ employees: Array<{ id: number; full_name: string; email: string }> }>("/api/hrms/employees", dashboardFetcher, {
    revalidateOnFocus: false,
  });
  const perfSwr = useSWR<{ cycles: Cycle[]; reviews: Review[] }>("/api/hrms/performance", dashboardFetcher, { revalidateOnFocus: false });

  async function createCycle() {
    if (!cycleName.trim() || !startDate || !endDate) {
      setToast({ message: "Cycle name, start date, and end date are required.", variant: "blocked" });
      return;
    }
    setBusy(true);
    try {
      await apiFetchJson("/api/hrms/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "cycle", name: cycleName.trim(), startDate, endDate }),
      });
      setCycleName("");
      setStartDate("");
      setEndDate("");
      setToast({ message: "Performance cycle created.", variant: "success" });
      await perfSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to create cycle.", variant: "error" });
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
      await apiFetchJson("/api/hrms/performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "review",
          cycleId: Number(selectedCycleId),
          employeeId: Number(employeeId),
          managerReview: { feedback: recommendation || "" },
          hrReview: { recommendation: recommendation || "" },
          rating: rating ? Number(rating) : null,
          recommendation: recommendation || null,
          status: "hr_reviewed",
        }),
      });
      setRating("");
      setRecommendation("");
      setToast({ message: "Performance review saved.", variant: "success" });
      await perfSwr.mutate();
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to save review.", variant: "error" });
    } finally {
      setBusy(false);
    }
  }

  const cycles = perfSwr.data?.cycles || [];
  const reviews = perfSwr.data?.reviews || [];

  return (
    <AccessGate permissionKey="performance.view_self">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={1800} /> : null}
      <ModulePageFrame title="Performance Management" subtitle="Manage KPI cycles, self/manager/HR reviews, ratings, and promotion recommendations.">
        <section className={UI.card + " p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Create appraisal cycle</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <input className={UI.input} placeholder="Cycle name (e.g., FY 26 H1)" value={cycleName} onChange={(e) => setCycleName(e.target.value)} />
            <input className={UI.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input className={UI.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <button type="button" className={UI.primaryButton + " py-2 text-sm"} onClick={() => void createCycle()} disabled={busy}>
              Create cycle
            </button>
          </div>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <h2 className="text-base font-semibold text-[var(--ats-text)]">Submit manager/HR review</h2>
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
            <input className={UI.input} type="number" min={1} max={5} step="0.1" placeholder="Rating (1-5)" value={rating} onChange={(e) => setRating(e.target.value)} />
            <input className={UI.input} placeholder="Recommendation / increment note" value={recommendation} onChange={(e) => setRecommendation(e.target.value)} />
          </div>
          <button type="button" className={UI.primaryButton + " mt-4 py-2 text-sm"} onClick={() => void saveReview()} disabled={busy}>
            Save review
          </button>
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
