"use client";

import useSWR from "swr";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";

type Workflow = { id: number; user_id: number; workflow_type: string; status: string; checklist: Record<string, boolean> };
type Goal = { id: number; employee_id: number; title: string; description: string };
type Review = { id: number; employee_id: number; cycle_name: string; rating: number | null; status: string; recommendation: string | null };
export default function MyRecordsPage() {
  const { data: me } = useSWR<{ user: { id: number }; permissions: Record<string, boolean> }>("/api/auth/me", dashboardFetcher);
  const permissions = me?.permissions || {};
  const { data: onboarding, error: onboardingError } = useSWR<{ workflows: Workflow[] }>(permissions["onboarding_exit.view_self"] ? "/api/hrms/onboarding-exit" : null, dashboardFetcher);
  const { data: performance, error: performanceError } = useSWR<{ goals: Goal[]; reviews: Review[] }>(permissions["performance.view_self"] ? "/api/hrms/performance" : null, dashboardFetcher);
  return <ModulePageFrame title="My HR Records" subtitle="Your joining checklists, goals and review history.">
    {!me ? <p>Loading your access…</p> : !permissions["onboarding_exit.view_self"] && !permissions["performance.view_self"] ? <p>Your account does not have access to these records. Contact HR.</p> : null}
    {permissions["onboarding_exit.view_self"] && <section id="onboarding" className={UI.card + " p-5 mb-5"}>
      <h2 className="font-semibold">My Onboarding & Exit</h2>
      {onboardingError ? <p role="alert" className="mt-3">Unable to load your checklists.</p> : !onboarding ? <p className="mt-3">Loading…</p> : onboarding.workflows.filter(row => row.user_id === me?.user.id).map(row => <div key={row.id} className="mt-4 border-t pt-3">
        <h3 className="font-medium capitalize">{row.workflow_type} · {row.status.replaceAll("_", " ")}</h3>
        <ul className="mt-2 space-y-1 text-sm">{Object.entries(row.checklist || {}).map(([label, done]) => <li key={label} className="capitalize">{done ? "✓" : "○"} {label.replaceAll("_", " ")}</li>)}</ul>
      </div>)}
      {onboarding && !onboarding.workflows.some(row => row.user_id === me?.user.id) && <p className="mt-3 text-sm">No checklists added yet.</p>}
    </section>}
    {permissions["performance.view_self"] && <section id="performance" className={UI.card + " p-5"}>
      <h2 className="font-semibold">My Performance</h2>
      {performanceError ? <p role="alert" className="mt-3">Unable to load your performance records.</p> : !performance ? <p className="mt-3">Loading…</p> : <>
        <h3 className="mt-4 text-sm font-semibold">Goals</h3>
        {performance.goals.filter(row => row.employee_id === me?.user.id).map(row => <div key={row.id} className="mt-3 border-t pt-3"><p className="font-medium">{row.title}</p><p className="text-sm text-[var(--ats-text-muted)]">{row.description}</p></div>)}
        {!performance.goals.some(row => row.employee_id === me?.user.id) && <p className="mt-2 text-sm">No goals added yet.</p>}
        <h3 className="mt-5 text-sm font-semibold">Reviews</h3>
        {performance.reviews.filter(row => row.employee_id === me?.user.id).map(row => <div key={row.id} className="mt-3 border-t pt-3"><p>{row.cycle_name} · {row.status}</p><p className="text-sm">Rating: {row.rating ?? "Not rated"}</p>{row.recommendation && <p className="text-sm">{row.recommendation}</p>}</div>)}
        {!performance.reviews.some(row => row.employee_id === me?.user.id) && <p className="mt-2 text-sm">No reviews added yet.</p>}
      </>}
    </section>}
  </ModulePageFrame>;
}
