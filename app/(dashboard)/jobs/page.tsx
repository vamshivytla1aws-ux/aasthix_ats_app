"use client";

import React, { Suspense, useState } from "react";
import useSWR from "swr";
import { Plus, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import JobForm from "@/components/JobForm";
import { JobList } from "@/components/JobList";
import Toast from "@/components/Toast";
import { useRouter, useSearchParams } from "next/navigation";
import { useDensity } from "@/lib/useDensity";
import DensityToggle from "@/components/ui/DensityToggle";
import AccessGate from "@/components/AccessGate";
import CareersHubCard from "@/components/CareersHubCard";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import FilterDrawer from "@/components/enterprise/FilterDrawer";
import RequisitionsWorkflowView from "@/components/jobs/RequisitionsWorkflowView";
import { UI } from "@/lib/ui";
import { apiFetchJson } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";

type Job = {
  id: number;
  title: string;
  company: string;
  location: string;
  status: string;
  open_positions?: number | null;
  employment_type?: string | null;
  experience_requirement?: string | null;
  created_at?: string | null;
  description?: string | null;
  vendor_id?: number | null;
  vendor_name?: string | null;
};

function JobsTableSkeleton() {
  return (
    <div className={`${UI.enterprise.elevatedCard} p-6`}>
      <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    </div>
  );
}

function StandardJobsView() {
  const router = useRouter();
  const { density, setDensity } = useDensity("ats:list-density", "compact");
  const { data: jobs = [], error, isLoading, mutate } = useSWR<Job[]>("/api/jobs");
  const { data: meData } = useSWR<{ user?: { role?: string }; permissions?: Record<string, boolean> }>(
    "/api/auth/me",
    dashboardFetcher
  );
  const canManageJobs =
    meData?.user?.role === "admin" || meData?.permissions?.["jobs.manage"] === true;
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [filterDrawer, setFilterDrawer] = useState(false);

  function onCreated(job: Job) {
    void mutate(
      (prev) => (prev ? [job, ...prev] : [job]),
      { revalidate: true }
    );
    setToast({ message: "Job added.", variant: "success" });
    try {
      localStorage.setItem("jobs_updated", String(Date.now()));
    } catch {
      // ignore
    }
    void apiFetchJson(`/api/jobs/${job.id}/skill-profile/extract`, { method: "POST" }).catch(() => {});
  }

  function onUpdated(job: Job) {
    void mutate(
      (prev) => (prev ? prev.map((j) => (j.id === job.id ? { ...j, ...job } : j)) : prev),
      { revalidate: true }
    );
    setToast({ message: "Job updated.", variant: "success" });
    void apiFetchJson(`/api/jobs/${job.id}/skill-profile/extract`, { method: "POST" }).catch(() => {});
  }

  async function handleDelete(job: Job) {
    const ok = window.confirm(`Delete job "${job.title}" at "${job.company}"?`);
    if (!ok) return;
    try {
      await apiFetchJson(`/api/jobs/${job.id}`, { method: "DELETE" });
      void mutate(
        (prev) => (prev ? prev.filter((j) => j.id !== job.id) : prev),
        { revalidate: true }
      );
      setToast({ message: "Job deleted.", variant: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete job";
      setToast({ message: msg, variant: "error" });
    }
  }

  const openCount = jobs.filter((j) => (j.status || "Open").toLowerCase().includes("open")).length;

  return (
    <AccessGate permissionKey="jobs.view">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} /> : null}

      <FilterDrawer
        open={filterDrawer}
        onClose={() => setFilterDrawer(false)}
        title="Job filters"
        onApply={() => setFilterDrawer(false)}
        onReset={() => setFilterDrawer(false)}
      >
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Use the search, status, and employment filters in the toolbar above the table. This drawer is reserved for
          saved views and advanced facets in a future release.
        </p>
      </FilterDrawer>

      <ModulePageFrame
        title="Jobs"
        subtitle="Open requisitions, JD workflow, and hiring status — dense table with quick row actions."
        metrics={
          error ? (
            <span className="text-red-600 dark:text-red-400">{(error as Error).message || "Failed to load"}</span>
          ) : isLoading ? (
            <span>Loading…</span>
          ) : (
            <span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{jobs.length}</span> roles ·{" "}
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">{openCount}</span> open
            </span>
          )
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/jobs?view=requisition" className={UI.secondaryButton + " py-2 text-xs"}>
              Requisition workflow
            </Link>
            <DensityToggle density={density} onChange={setDensity} />
            <button
              type="button"
              onClick={() => setFilterDrawer(true)}
              className={UI.secondaryButton + " py-2 text-xs"}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              More filters
            </button>
            <button type="button" onClick={() => void mutate()} className={UI.secondaryButton + " py-2 text-xs"}>
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={UI.primaryButton + " py-2 text-sm"}
            >
              <Plus className="h-4 w-4" />
              Add job
            </button>
          </div>
        }
        toolbar={<CareersHubCard />}
      >
        <JobForm open={open} onClose={() => setOpen(false)} onCreated={onCreated} />
        <JobForm
          open={editOpen}
          onClose={() => {
            setEditOpen(false);
            setEditingJob(null);
          }}
          mode="edit"
          initialJob={editingJob}
          onCreated={(job) => {
            onUpdated(job);
            setEditOpen(false);
            setEditingJob(null);
          }}
        />

        {isLoading ? (
          <JobsTableSkeleton />
        ) : (
          <JobList
            jobs={jobs}
            density={density}
            canManageJobs={canManageJobs}
            onView={(job) => router.push(`/jobs/${job.id}`)}
            onEdit={(job) => {
              setEditingJob(job);
              setEditOpen(true);
            }}
            onDelete={handleDelete}
            onJobsRefresh={() => void mutate()}
          />
        )}
      </ModulePageFrame>
    </AccessGate>
  );
}

function JobsPageInner() {
  const searchParams = useSearchParams();
  const isRequisitionView = searchParams.get("view") === "requisition";

  if (isRequisitionView) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/jobs?view=standard" className={UI.secondaryButton + " py-2 text-xs"}>
            Standard view
          </Link>
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-800">
            Requisition Workflow
          </span>
        </div>
        <RequisitionsWorkflowView />
      </div>
    );
  }

  return <StandardJobsView />;
}

export default function JobsPage() {
  return (
    <Suspense fallback={<StandardJobsView />}>
      <JobsPageInner />
    </Suspense>
  );
}
