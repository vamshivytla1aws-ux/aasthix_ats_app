"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ChevronDown, ChevronUp, Filter, SlidersHorizontal, UserPlus } from "lucide-react";
import CandidateForm from "@/components/CandidateForm";
import BulkCandidateIntake from "@/components/BulkCandidateIntake";
import DataTable, { type CandidateSearchScope } from "@/components/table/DataTable";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { UI } from "@/lib/ui";
import { useDensity } from "@/lib/useDensity";
import DensityToggle from "@/components/ui/DensityToggle";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import FilterDrawer from "@/components/enterprise/FilterDrawer";
import TableFilters from "@/components/table/TableFilters";
import Toast from "@/components/Toast";

type Candidate = {
  id: number;
  full_name: string;
  email: string;
  phone?: string | null;
  linkedin_url?: string | null;
  website_url?: string | null;
  location?: string | null;
  resume_url?: string | null;
  skills?: string | null;
  applied_companies?: string | null;
  applied_job_titles?: string | null;
  applied_company_names?: string | null;
  current_salary?: number | null;
  expected_salary?: number | null;
  notice_period?: string | null;
  expected_percentage?: number | null;
  status?: "Active" | "Placed" | string | null;
  source?: string | null;
};

type JobOption = { id: number; title: string; company: string };

const SCOPE_PILLS: { id: CandidateSearchScope; label: string }[] = [
  { id: "all", label: "All fields" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone" },
  { id: "location", label: "Location" },
  { id: "company", label: "Company" },
  { id: "jobTitle", label: "Job title" },
];

function CandidatesPageInner() {
  const searchParams = useSearchParams();
  const { density, setDensity } = useDensity("ats:list-density", "compact");
  const {
    data: candidates = [],
    error: swrError,
    isLoading,
    mutate: mutateCandidates,
  } = useSWR<Candidate[]>("/api/candidates");
  const { data: jobsForBulk = [] } = useSWR<JobOption[]>("/api/jobs");
  const [bulkJobId, setBulkJobId] = useState<string>("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkTagBusy, setBulkTagBusy] = useState(false);

  const [editCandidate, setEditCandidate] = useState<Candidate | null>(null);
  const [addFormExpanded, setAddFormExpanded] = useState(false);
  const [heroSearch, setHeroSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchScope, setSearchScope] = useState<CandidateSearchScope>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [filterLocation, setFilterLocation] = useState("");
  const [filterSkillset, setFilterSkillset] = useState("");
  const [filterStatus, setFilterStatus] = useState<"All" | "Active" | "Placed">("All");
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  useEffect(() => {
    const q = searchParams.get("q");
    if (q != null) setHeroSearch(q);
  }, [searchParams]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(heroSearch.trim()), 280);
    return () => window.clearTimeout(t);
  }, [heroSearch]);

  const locationOptions = useMemo(
    () =>
      Array.from(new Set(candidates.map((d) => (d.location || "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [candidates]
  );

  function handleCreated(c: Candidate) {
    void mutateCandidates(
      (prev) => {
        if (!prev) return [c];
        const idx = prev.findIndex((p) => p.id === c.id);
        if (idx === -1) return [c, ...prev];
        const next = [...prev];
        next[idx] = { ...next[idx], ...c };
        return next;
      },
      { revalidate: true }
    );
  }

  async function handleDelete(candidate: Candidate) {
    try {
      await apiFetchJson("/api/candidates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: candidate.id }),
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
      void mutateCandidates(
        (prev) => (prev ? prev.filter((x) => x.id !== candidate.id) : prev),
        { revalidate: true }
      );
      setToast({ message: "Candidate deleted.", variant: "success" });
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 403
        ? `${e.message} — candidates.manage is required.`
        : (e as Error)?.message || "Delete failed";
      setToast({ message: msg, variant: "error" });
    }
  }

  const resetFilters = useCallback(() => {
    setHeroSearch("");
    setSearchScope("all");
    setFilterLocation("");
    setFilterSkillset("");
    setFilterStatus("All");
  }, []);

  const selectedList = useMemo(
    () => candidates.filter((c) => selectedIds.has(c.id)),
    [candidates, selectedIds]
  );

  const firstEmail = selectedList[0]?.email;

  return (
    <AccessGate permissionKey="candidates.view">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={3500} /> : null}
      <ModulePageFrame
        title="Candidates"
        subtitle="Enterprise talent pool — search, filter, and act from one dense workspace."
        metrics={
          swrError ? (
            <span className="text-red-600 dark:text-red-400">{(swrError as Error).message}</span>
          ) : isLoading ? (
            <span>Loading…</span>
          ) : (
            <span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{candidates.length}</span> in pool
              {selectedIds.size > 0 ? (
                <>
                  {" "}
                  · <span className="font-semibold text-blue-700 dark:text-blue-400">{selectedIds.size}</span> selected
                </>
              ) : null}
            </span>
          )
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DensityToggle density={density} onChange={setDensity} />
            <button type="button" onClick={() => setFilterOpen(true)} className={UI.secondaryButton + " py-2 text-xs"}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              More filters
            </button>
            <button type="button" onClick={() => void mutateCandidates()} className={UI.secondaryButton + " py-2 text-xs"}>
              Refresh
            </button>
          </div>
        }
        toolbar={
          <div className="space-y-3">
            <div className={`${UI.enterprise.elevatedCard} p-4`}>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Search by keyword or email
              </label>
              <input
                type="search"
                value={heroSearch}
                onChange={(e) => setHeroSearch(e.target.value)}
                placeholder="Search by keyword or email"
                className={UI.input + " py-3 text-base"}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {SCOPE_PILLS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSearchScope(p.id)}
                    className={searchScope === p.id ? UI.enterprise.pillActive : UI.enterprise.pillInactive}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {selectedIds.size > 0 ? (
              <div
                className={`flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/40 sm:flex-row sm:flex-wrap sm:items-center`}
              >
                <span className="text-xs font-semibold text-blue-900 dark:text-blue-200">Bulk actions</span>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={bulkJobId}
                    onChange={(e) => setBulkJobId(e.target.value)}
                    className="max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900"
                  >
                    <option value="">Select job…</option>
                    {jobsForBulk.map((j) => (
                      <option key={j.id} value={String(j.id)}>
                        {j.title} — {j.company}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={UI.primaryButton + " py-1.5 text-xs"}
                    disabled={bulkBusy || !bulkJobId}
                    onClick={async () => {
                      const jid = Number(bulkJobId);
                      if (!Number.isFinite(jid) || jid <= 0) return;
                      setBulkBusy(true);
                      try {
                        const res = await apiFetchJson<{ created_or_touched: number }>("/api/applications/bulk", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ job_id: jid, candidate_ids: Array.from(selectedIds) }),
                        });
                        setToast({ message: `Added or updated ${res.created_or_touched} application(s).`, variant: "success" });
                        setSelectedIds(new Set());
                        setBulkJobId("");
                      } catch (e: any) {
                        const msg = e instanceof ApiError && e.status === 403
                          ? `${e.message} — pipeline.manage is required.`
                          : e?.message || "Bulk add failed";
                        setToast({ message: msg, variant: "error" });
                      } finally {
                        setBulkBusy(false);
                      }
                    }}
                  >
                    {bulkBusy ? "Working…" : "Add to pipeline"}
                  </button>
                </div>
                  <button
                    type="button"
                    className={UI.secondaryButton + " py-1.5 text-xs"}
                    disabled={!firstEmail}
                    onClick={() => {
                      if (!firstEmail) return;
                      const rest = selectedList
                        .map((c) => c.email)
                        .filter((e): e is string => Boolean(e && e !== firstEmail));
                      const bcc = rest.length ? `?bcc=${rest.map(encodeURIComponent).join(",")}` : "";
                      window.location.href = `mailto:${encodeURIComponent(firstEmail)}${bcc}`;
                    }}
                  >
                    Send email
                  </button>
                  <div className="flex flex-wrap items-center gap-1">
                    <input
                      type="text"
                      placeholder="Tags (comma-separated)"
                      value={bulkTagInput}
                      onChange={(e) => setBulkTagInput(e.target.value)}
                      className="min-w-[140px] max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-900"
                    />
                    <button
                      type="button"
                      className={UI.secondaryButton + " py-1.5 text-xs"}
                      disabled={bulkTagBusy || !bulkTagInput.trim()}
                      onClick={async () => {
                        const add_tags = bulkTagInput
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean);
                        if (add_tags.length === 0) return;
                        setBulkTagBusy(true);
                        try {
                          await apiFetchJson("/api/candidates/bulk-tags", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ candidate_ids: Array.from(selectedIds), add_tags }),
                          });
                          setToast({ message: "Tags updated.", variant: "success" });
                          setBulkTagInput("");
                          void mutateCandidates();
                        } catch (e: any) {
                          const msg =
                            e instanceof ApiError && e.status === 403
                              ? `${e.message} — candidates.manage is required.`
                              : e?.message || "Tag failed";
                          setToast({ message: msg, variant: "error" });
                        } finally {
                          setBulkTagBusy(false);
                        }
                      }}
                    >
                      {bulkTagBusy ? "…" : "Add tags"}
                    </button>
                  </div>
                <button
                  type="button"
                  className="ml-auto text-xs font-semibold text-blue-800 underline dark:text-blue-300"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear selection
                </button>
              </div>
            ) : null}
          </div>
        }
      >
        <FilterDrawer
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          title="Refine candidates"
          onReset={resetFilters}
          onApply={() => {}}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Adjust filters below. Changes apply immediately to the list.
            </p>
            <div className="rounded-lg border border-slate-200 dark:border-slate-600">
              <TableFilters
                search={heroSearch}
                onSearchChange={setHeroSearch}
                location={filterLocation}
                onLocationChange={setFilterLocation}
                status={filterStatus}
                onStatusChange={setFilterStatus}
                skillsetInput={filterSkillset}
                onSkillsetInputChange={setFilterSkillset}
                locations={locationOptions}
                onClear={resetFilters}
              />
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Experience</h3>
              <p className="text-xs text-slate-500">Coming soon — years of experience filter.</p>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Priority</h3>
              <p className="text-xs text-slate-500">Coming soon — priority tagging.</p>
            </div>
          </div>
        </FilterDrawer>

        {editCandidate ? (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/20 p-1 dark:border-amber-900/40 dark:bg-amber-950/20">
            <CandidateForm
              onCreated={(c) => {
                handleCreated(c);
                setEditCandidate(null);
              }}
              mode="edit"
              initialCandidate={editCandidate}
              onCancel={() => setEditCandidate(null)}
            />
          </div>
        ) : (
          <div className={`${UI.enterprise.elevatedCard} overflow-hidden`}>
            <button
              type="button"
              onClick={() => setAddFormExpanded((e) => !e)}
              className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/80"
              aria-expanded={addFormExpanded}
            >
              <span className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-md shadow-blue-600/20">
                  <UserPlus className="h-4 w-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">New candidate</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">Intake, resume, skills</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
                {addFormExpanded ? (
                  <>
                    Hide <ChevronUp className="h-4 w-4" aria-hidden />
                  </>
                ) : (
                  <>
                    Show <ChevronDown className="h-4 w-4" aria-hidden />
                  </>
                )}
              </span>
            </button>
            {addFormExpanded ? (
              <div className="space-y-3 border-t border-slate-200 px-2 pb-3 pt-2 dark:border-slate-600 sm:px-3">
                <BulkCandidateIntake onImported={() => void mutateCandidates()} />
                <CandidateForm onCreated={handleCreated} />
              </div>
            ) : null}
          </div>
        )}

        <div className="pt-2">
          {swrError && candidates.length === 0 ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-6 text-center shadow-sm dark:border-rose-900 dark:bg-rose-950/40">
              <div className="text-base font-semibold text-rose-900 dark:text-rose-100">Unable to load candidates</div>
              <p className="mt-1 text-sm text-rose-800 dark:text-rose-200">{(swrError as Error).message}</p>
              <button type="button" className={UI.secondaryButton + " mt-4 py-2 text-xs"} onClick={() => void mutateCandidates()}>
                Retry
              </button>
            </div>
          ) : isLoading ? (
            <div className={`${UI.enterprise.elevatedCard} p-6`}>
              <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            </div>
          ) : candidates.length === 0 ? (
            <div className={`${UI.enterprise.elevatedCard} p-10 text-center`}>
              <Filter className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
              <div className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">No candidates yet</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Add a candidate above to build your pool.</div>
            </div>
          ) : (
            <DataTable
              density={density}
              data={candidates}
              onEdit={(candidate) => setEditCandidate(candidate)}
              onDelete={handleDelete}
              controlledSearch={debouncedSearch}
              onControlledSearchChange={setHeroSearch}
              searchScope={searchScope}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              filterLocation={filterLocation}
              onFilterLocationChange={setFilterLocation}
              filterSkillset={filterSkillset}
              onFilterSkillsetChange={setFilterSkillset}
              filterStatus={filterStatus}
              onFilterStatusChange={setFilterStatus}
              onRequestClearFilters={() => setSearchScope("all")}
            />
          )}
        </div>
      </ModulePageFrame>
    </AccessGate>
  );
}

export default function CandidatesPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-700 dark:bg-slate-900">
          <div className="h-6 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      }
    >
      <CandidatesPageInner />
    </Suspense>
  );
}
