"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, User, Briefcase, FileText, X, Loader2, Clock } from "lucide-react";
import { apiFetchJson } from "@/lib/apiClient";

type Props = { variant?: "shell" | "panel" };

type CandidateResult = {
  id: number;
  full_name: string;
  email: string;
  location: string;
  status: string;
  latest_application_id?: number | null;
};
type JobResult = { id: number; title: string; company: string; status: string; location: string };
type AppResult = {
  id: number;
  stage: string;
  candidate_name: string;
  candidate_id: number;
  job_title: string;
  job_id: number;
  assigned_recruiter_name?: string | null;
};
type SearchResults = { candidates: CandidateResult[]; jobs: JobResult[]; applications: AppResult[] };

type SearchScope = "all" | "candidates" | "jobs" | "applications";

type RecentEntry = {
  kind: "candidate" | "job" | "application";
  href: string;
  primary: string;
  secondary?: string;
  at: string;
};

const RECENT_KEY = "ats:global-search-recent";
const RECENT_MAX = 12;

function loadRecent(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is RecentEntry =>
        x &&
        typeof x === "object" &&
        typeof (x as RecentEntry).href === "string" &&
        typeof (x as RecentEntry).primary === "string"
    );
  } catch {
    return [];
  }
}

function saveRecent(entries: RecentEntry[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(entries.slice(0, RECENT_MAX)));
  } catch {
    /* ignore */
  }
}

function pushRecent(entry: Omit<RecentEntry, "at">) {
  const prev = loadRecent();
  const next = [{ ...entry, at: new Date().toISOString() }, ...prev.filter((e) => e.href !== entry.href)];
  saveRecent(next);
}

export default function GlobalHeaderSearch({ variant = "shell" }: Props) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<SearchScope>("all");
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [canCandidates, setCanCandidates] = useState(true);
  const [canJobs, setCanJobs] = useState(true);
  const [canPipeline, setCanPipeline] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const isPanel = variant === "panel";

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetchJson<{ permissions?: Record<string, boolean>; user?: { role?: string } }>("/api/auth/me")
      .then((me) => {
        if (cancelled) return;
        const role = (me.user?.role || "user").toLowerCase();
        const isAdmin = role === "admin";
        const p = me.permissions || {};
        setCanCandidates(isAdmin || p["candidates.view"] !== false);
        setCanJobs(isAdmin || p["jobs.view"] !== false);
        setCanPipeline(isAdmin || p["pipeline.view"] !== false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const allowedScopes = useMemo(() => {
    const list: SearchScope[] = ["all"];
    if (canCandidates) list.push("candidates");
    if (canJobs) list.push("jobs");
    if (canPipeline) list.push("applications");
    return list;
  }, [canCandidates, canJobs, canPipeline]);

  useEffect(() => {
    if (!allowedScopes.includes(scope)) {
      setScope("all");
    }
  }, [allowedScopes, scope]);

  // Press "/" to focus search
  useEffect(() => {
    if (isPanel) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isPanel]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    setResults(null);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("q", q);
        params.set("limit", "8");
        params.set("scope", scope);
        const data = await apiFetchJson<SearchResults>(`/api/search?${params.toString()}`);
        const safe: SearchResults = {
          candidates: Array.isArray(data.candidates) ? data.candidates : [],
          jobs: Array.isArray(data.jobs) ? data.jobs : [],
          applications: Array.isArray(data.applications) ? data.applications : [],
        };
        setResults(safe);
        setOpen(true);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, scope]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = value.trim();
      if (!q) return;
      if (scope === "jobs") router.push(`/jobs?q=${encodeURIComponent(q)}`);
      else if (scope === "applications") router.push(`/pipeline?q=${encodeURIComponent(q)}`);
      else router.push(`/candidates?q=${encodeURIComponent(q)}`);
      setOpen(false);
    },
    [router, value, scope]
  );

  const handleSelect = useCallback(() => {
    setOpen(false);
    setValue("");
    setRecent(loadRecent());
  }, []);

  const onPickRecent = useCallback((r: RecentEntry) => {
    pushRecent({ kind: r.kind, href: r.href, primary: r.primary, secondary: r.secondary });
    router.push(r.href);
    handleSelect();
  }, [router, handleSelect]);

  const totalResults = results
    ? (results.candidates?.length ?? 0) + (results.jobs?.length ?? 0) + (results.applications?.length ?? 0)
    : 0;

  const showRecentPanel = open && value.trim().length < 2 && recent.length > 0;
  const showSearchPanel = open && value.trim().length >= 2;
  const showDropdown =
    open && (showRecentPanel || showSearchPanel || (value.trim().length >= 2 && loading));
  const shellChipBase = isPanel
    ? "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    : "border-white/25 bg-white/10 text-white/90 hover:bg-white/20";

  function scopeChipActive(s: SearchScope) {
    return scope === s
      ? isPanel
        ? "border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-500 dark:bg-indigo-950 dark:text-indigo-200"
        : "border-white/50 bg-white/25 text-white"
      : shellChipBase;
  }

  return (
    <div ref={containerRef} className={isPanel ? "w-full" : "relative hidden min-w-0 max-w-lg flex-1 sm:block"}>
      <form onSubmit={handleSubmit} role="search">
        <div className="relative flex flex-col gap-1.5">
          <div className="relative flex items-center">
            <Search
              className={[
                "pointer-events-none absolute left-3 h-4 w-4",
                isPanel ? "text-slate-400" : "text-white/60",
              ].join(" ")}
              aria-hidden
            />
            <input
              ref={inputRef}
              type="text"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => {
                const r = loadRecent();
                setRecent(r);
                const q = value.trim();
                if (q.length >= 2) setOpen(true);
                else if (r.length > 0) setOpen(true);
              }}
              placeholder="Search candidates, jobs, applications…  ( / )"
              className={[
                "w-full min-w-0 rounded-lg border px-3 py-2 pl-9 pr-9 text-sm outline-none transition focus:ring-2",
                isPanel
                  ? "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-indigo-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  : "border-white/30 bg-white/15 text-white placeholder:text-white/60 focus:border-white/50 focus:ring-white/30",
              ].join(" ")}
              aria-label="Global search"
              aria-haspopup="listbox"
            />
            {loading && (
              <Loader2
                className={[
                  "absolute right-3 h-4 w-4 animate-spin",
                  isPanel ? "text-slate-400" : "text-white/70",
                ].join(" ")}
              />
            )}
            {!loading && value && (
              <button
                type="button"
                onClick={() => {
                  setValue("");
                  setResults(null);
                  setOpen(false);
                }}
                className={[
                  "absolute right-3 rounded p-0.5 transition",
                  isPanel
                    ? "text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                    : "text-white/60 hover:text-white/90",
                ].join(" ")}
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {allowedScopes.map((allowedScope) => (
              <button
                key={allowedScope}
                type="button"
                onClick={() => setScope(allowedScope)}
                className={[
                  "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition",
                  scopeChipActive(allowedScope),
                ].join(" ")}
              >
                {allowedScope === "all" ? "All" : allowedScope}
              </button>
            ))}
            <span className={isPanel ? "ml-auto text-[11px] text-slate-500 dark:text-slate-400" : "ml-auto text-[11px] text-white/65"}>
              Press / to focus
            </span>
          </div>
        </div>
      </form>

      {/* Results dropdown */}
      {showDropdown && (
        <div
          id="global-search-results"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {showRecentPanel ? (
            <div className="border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                <Clock className="h-3.5 w-3.5" />
                Recent
              </div>
              {recent.map((r) => (
                <button
                  key={r.href + r.at}
                  type="button"
                  onClick={() => onPickRecent(r)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{r.primary}</div>
                    {r.secondary ? <div className="truncate text-xs text-slate-500">{r.secondary}</div> : null}
                  </div>
                </button>
              ))}
              <div className="px-4 py-2 text-[10px] text-slate-500 dark:text-slate-400">Type 2+ characters to search</div>
            </div>
          ) : null}

          {showSearchPanel && loading && !results ? (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching…
            </div>
          ) : null}

          {showSearchPanel && results && (
            <>
              {totalResults === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-slate-500">
                  No results for &ldquo;{value.trim()}&rdquo;
                </div>
              ) : (
                <>
                  {results.candidates?.length > 0 && (
                    <ResultSection title="Candidates" icon={<User className="h-3.5 w-3.5" />}>
                      {results.candidates.map((c) => {
                        const candHref =
                          c.latest_application_id != null
                            ? `/candidates/${c.id}?application=${c.latest_application_id}`
                            : `/candidates/${c.id}`;
                        return (
                        <ResultItem
                          key={`c-${c.id}`}
                          href={candHref}
                          onNavigate={() => {
                            pushRecent({
                              kind: "candidate",
                              href: candHref,
                              primary: c.full_name,
                              secondary: [c.email, c.location].filter(Boolean).join(" · "),
                            });
                            handleSelect();
                          }}
                          primary={c.full_name}
                          secondary={[c.email, c.location].filter(Boolean).join(" · ")}
                          badge={c.status}
                          badgeColor={
                            c.status === "Placed" ? "indigo" : c.status === "Active" ? "emerald" : "slate"
                          }
                        />
                        );
                      })}
                    </ResultSection>
                  )}

                  {results.jobs?.length > 0 && (
                    <ResultSection title="Jobs" icon={<Briefcase className="h-3.5 w-3.5" />}>
                      {results.jobs.map((j) => (
                        <ResultItem
                          key={`j-${j.id}`}
                          href={`/jobs/${j.id}`}
                          onNavigate={() => {
                            pushRecent({
                              kind: "job",
                              href: `/jobs/${j.id}`,
                              primary: j.title,
                              secondary: [j.company, j.location].filter(Boolean).join(" · "),
                            });
                            handleSelect();
                          }}
                          primary={j.title}
                          secondary={[j.company, j.location].filter(Boolean).join(" · ")}
                          badge={j.status || "Open"}
                          badgeColor={
                            (j.status || "").toLowerCase().includes("open")
                              ? "emerald"
                              : (j.status || "").toLowerCase().includes("closed")
                                ? "slate"
                                : "amber"
                          }
                        />
                      ))}
                    </ResultSection>
                  )}

                  {results.applications?.length > 0 && (
                    <ResultSection title="Applications" icon={<FileText className="h-3.5 w-3.5" />}>
                      {results.applications.map((a) => {
                        const appHref = `/candidates/${a.candidate_id}?application=${a.id}`;
                        return (
                        <ResultItem
                          key={`a-${a.id}`}
                          href={appHref}
                          onNavigate={() => {
                            pushRecent({
                              kind: "application",
                              href: appHref,
                              primary: a.candidate_name,
                              secondary: `${a.job_title} · ${a.stage}${a.assigned_recruiter_name ? ` · ${a.assigned_recruiter_name}` : ""}`,
                            });
                            handleSelect();
                          }}
                          primary={a.candidate_name}
                          secondary={`${a.job_title} · ${a.stage}${a.assigned_recruiter_name ? ` · ${a.assigned_recruiter_name}` : ""}`}
                          badge={a.stage}
                          badgeColor={
                            a.stage === "Selected"
                              ? "emerald"
                              : a.stage === "Rejected"
                                ? "red"
                                : a.stage === "Interview"
                                  ? "amber"
                                  : "indigo"
                          }
                        />
                        );
                      })}
                    </ResultSection>
                  )}

                  <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => {
                        const q = value.trim();
                        if (scope === "jobs") router.push(`/jobs?q=${encodeURIComponent(q)}`);
                        else if (scope === "applications") router.push(`/pipeline?q=${encodeURIComponent(q)}`);
                        else router.push(`/candidates?q=${encodeURIComponent(q)}`);
                        handleSelect();
                      }}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
                    >
                      View all in {scope === "jobs" ? "jobs" : scope === "applications" ? "pipeline" : "candidates"} →
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ResultSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 last:border-0 dark:border-slate-800">
      <div className="flex items-center gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function ResultItem({
  href,
  onNavigate,
  primary,
  secondary,
  badge,
  badgeColor,
}: {
  href: string;
  onNavigate: () => void;
  primary: string;
  secondary: string;
  badge?: string;
  badgeColor?: string;
}) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    red: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };

  return (
    <Link
      href={href}
      onClick={() => onNavigate()}
      className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{primary}</div>
        {secondary && <div className="truncate text-xs text-slate-500">{secondary}</div>}
      </div>
      {badge && (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors[badgeColor ?? "slate"] ?? colors.slate}`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}
