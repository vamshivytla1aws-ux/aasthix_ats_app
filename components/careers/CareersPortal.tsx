"use client";

import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calendar, CheckCircle2, Clock, FileText, MapPin, Search, Send, Sparkles, X } from "lucide-react";
import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";

type PublicJob = {
  id: number;
  title: string;
  location: string;
  status: string;
  open_positions: number;
  employment_type: string;
  description: string | null;
  experience_requirement: string | null;
  created_at: string | null;
};

const EMPTY_APPLY_FORM = {
  full_name: "",
  email: "",
  phone: "",
  experience: "",
  notice_period: "",
  current_salary: "",
  expected_salary: "",
  location: "",
  consent: false,
};

function formatPosted(d: string | null) {
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(d));
  } catch {
    return d;
  }
}

function sessionKey() {
  try {
    const k = "careers_session_id";
    let v = localStorage.getItem(k);
    if (!v) {
      v =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()) + Math.random().toString(36).slice(2);
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return "anon";
  }
}

export default function CareersPortal() {
  const baseId = useId();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [jdJob, setJdJob] = useState<PublicJob | null>(null);
  const [applyJob, setApplyJob] = useState<PublicJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resumeName, setResumeName] = useState<string>("");
  const [form, setForm] = useState(EMPTY_APPLY_FORM);
  const [query, setQuery] = useState("");
  const filteredJobs = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return jobs;
    return jobs.filter((job) =>
      [job.title, job.location, job.employment_type, job.experience_requirement].some((value) =>
        String(value || "").toLowerCase().includes(term)
      )
    );
  }, [jobs, query]);

  const track = useCallback(async (event_type: string, job_id?: number | null) => {
    try {
      await fetch("/api/careers/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type,
          job_id: job_id ?? null,
          session_id: sessionKey(),
        }),
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/careers/jobs", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data.configured === false) {
          setConfigured(false);
          setJobs([]);
          return;
        }
        setConfigured(true);
        const list = Array.isArray(data.jobs) ? data.jobs : [];
        setJobs(list);
        if (list.length >= 0) void track("view_job_list");
      } catch {
        if (!cancelled) {
          setLoadError("We couldn’t load openings right now. Please try again shortly.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [track]);

  function openJd(job: PublicJob) {
    setJdJob(job);
    void track("view_jd", job.id);
  }

  function openApply(job: PublicJob) {
    setForm(EMPTY_APPLY_FORM);
    setResumeName("");
    setApplyJob(job);
    setFormError(null);
    void track("start_apply", job.id);
  }

  const isApplyDirty = useMemo(() => {
    if (!applyJob) return false;
    return (
      Boolean(form.full_name.trim()) ||
      Boolean(form.email.trim()) ||
      Boolean(form.phone.trim()) ||
      Boolean(form.experience.trim()) ||
      Boolean(form.notice_period.trim()) ||
      Boolean(form.current_salary.trim()) ||
      Boolean(form.expected_salary.trim()) ||
      Boolean(form.location.trim()) ||
      form.consent ||
      Boolean(resumeName.trim())
    );
  }, [applyJob, form, resumeName]);

  const confirmDiscard = useCallback(() => {
    if (typeof window === "undefined") return true;
    return window.confirm("Unsaved data will be lost. Are you sure you want to leave?");
  }, []);

  const closeApply = useCallback(() => {
    if (submitting) return;
    if (isApplyDirty && !confirmDiscard()) return;
    setApplyJob(null);
    setForm(EMPTY_APPLY_FORM);
    setResumeName("");
    setFormError(null);
  }, [confirmDiscard, isApplyDirty, submitting]);

  const onBrandNavigate = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (submitting) {
      e.preventDefault();
      return;
    }
    if (applyJob && isApplyDirty && !confirmDiscard()) {
      e.preventDefault();
    }
  }, [applyJob, confirmDiscard, isApplyDirty, submitting]);

  useEffect(() => {
    if (!applyJob || !isApplyDirty || submitting) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [applyJob, isApplyDirty, submitting]);

  async function onApplySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!applyJob) return;
    setSubmitting(true);
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("job_id", String(applyJob.id));
    fd.set("role_title", applyJob.title);
    fd.set("session_id", sessionKey());
    fd.set("consent", form.consent ? "true" : "false");
    try {
      const res = await fetch("/api/careers/apply", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(typeof data.error === "string" ? data.error : "Submission failed");
        setSubmitting(false);
        return;
      }
      const title = encodeURIComponent(String(data.job_title || applyJob.title || ""));
      window.location.href = `/careers/success?title=${title}`;
    } catch {
      setFormError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  const heroSubtitle = useMemo(
    () =>
      "Discover roles that match your craft — transparent JDs, a single secure application, and a direct line to our recruiting team.",
    []
  );

  return (
    <div className="min-h-screen bg-[var(--ats-bg-page-accent)] text-[var(--ats-text)]">
      <header className="sticky top-0 z-30 border-b border-[var(--ats-border)] bg-[color:rgb(255_254_250_/_0.86)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <a
            href="https://www.aasthix.com"
            onClick={onBrandNavigate}
            className="flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
          >
            <BrandLogo
              size={44}
              className="shrink-0 rounded-xl bg-slate-950/70 p-1 ring-1 ring-white/10"
            />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--ats-primary)]">AASTHIX</p>
              <p className="text-sm text-[var(--ats-text-muted)]">Talent &amp; Delivery</p>
            </div>
          </a>
          <Link
            href="/login"
            className="text-sm font-semibold text-[var(--ats-text-muted)] underline-offset-4 hover:text-[var(--ats-primary)] hover:underline"
          >
            Recruiter sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-[var(--ats-border)] bg-[linear-gradient(140deg,#102a2e,#175551_68%,#1d6b64)] p-8 text-white shadow-[var(--ats-shadow-md)] sm:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-violet-500/15 blur-3xl" />
          <h1 className="relative font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
            Build meaningful work with AASTHIX
          </h1>
          <p className="relative mt-4 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">{heroSubtitle}</p>
        </section>

        <section className="mt-10 rounded-[var(--ats-radius-xl)] border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-8 shadow-[var(--ats-shadow-sm)] sm:p-10">
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-[var(--ats-text)]">
            <Sparkles className="h-5 w-5 text-[var(--ats-primary)]" />
            About AASTHIX
          </h2>
          <p className="mt-4 leading-relaxed text-[var(--ats-text-muted)]">
            AASTHIX partners with enterprises to design, build, and run mission-critical technology programs. We value
            craft, ownership, and clarity — from how we scope work to how we grow teams. Our hiring process is built to
            respect your time: realistic job descriptions, structured interviews, and timely feedback at every step.
          </p>
          <ul className="mt-6 grid gap-3 text-sm text-[var(--ats-text-muted)] sm:grid-cols-2">
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              Enterprise delivery mindset with product-grade engineering standards
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              Transparent stages from application to offer
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              Hybrid-friendly roles across key locations
            </li>
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              Data handled securely — no third-party form providers
            </li>
          </ul>
        </section>

        <section className="mt-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 className="font-display text-2xl font-semibold text-[var(--ats-text)]">Open positions</h2><p className="mt-2 text-[var(--ats-text-muted)]">Only active roles with available headcount are listed.</p></div>
            <label className="relative block w-full sm:max-w-sm"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ats-text-soft)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search roles or locations" className="min-h-11 w-full rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] pl-10 pr-4 text-sm outline-none focus:border-[var(--ats-primary)] focus:ring-4 focus:ring-[var(--ats-focus)]" /></label>
          </div>

          {loadError && (
            <div className="mt-8 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-100">{loadError}</div>
          )}

          {configured === false && (
            <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-amber-100">
              The public careers portal is not configured yet. Please check back soon or reach out through our main
              channels.
            </div>
          )}

          {configured === true && jobs.length === 0 && !loadError && (
            <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/50 px-4 py-8 text-center text-slate-400">
              There are no open positions at the moment. Follow us for future openings.
            </div>
          )}

          {jobs.length > 0 && (
            <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 shadow-xl">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-slate-950/80 text-xs uppercase tracking-wide text-slate-400">
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Date posted</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Role</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Employment type</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">Experience</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredJobs.map((job) => (
                      <tr key={job.id} className="hover:bg-white/[0.03]">
                        <td className="whitespace-nowrap px-4 py-4 text-slate-300">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-slate-500" />
                            {formatPosted(job.created_at)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-medium text-white">{job.title}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {job.location}
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-slate-300">{job.employment_type || "—"}</td>
                        <td className="max-w-xs px-4 py-4 text-slate-300">
                          {job.experience_requirement?.trim() || "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openJd(job)}
                              className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/10"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              View JD
                            </button>
                            <button
                              type="button"
                              onClick={() => openApply(job)}
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-400"
                            >
                              Apply
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <footer className="mt-16 border-t border-white/10 pt-8 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} AASTHIX · Careers portal powered by Aasthix Talent ATS
        </footer>
      </main>

      {/* JD modal */}
      <AnimatePresence>
        {jdJob && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              aria-label="Close"
              onClick={() => setJdJob(null)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${baseId}-jd-title`}
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className="relative z-10 flex max-h-[min(88vh,900px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-slate-900 shadow-2xl sm:rounded-3xl"
            >
              <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-4">
                <div>
                  <h3 id={`${baseId}-jd-title`} className="text-lg font-semibold text-white">
                    {jdJob.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {jdJob.location}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setJdJob(null)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                  <span className="rounded-full bg-white/5 px-3 py-1">{jdJob.employment_type}</span>
                  {jdJob.experience_requirement ? (
                    <span className="rounded-full bg-white/5 px-3 py-1">{jdJob.experience_requirement}</span>
                  ) : null}
                  <span className="rounded-full bg-white/5 px-3 py-1">{jdJob.open_positions} open headcount</span>
                </div>
                <div className="prose prose-invert prose-sm mt-6 max-w-none">
                  <p className="whitespace-pre-wrap text-slate-300 leading-relaxed">
                    {jdJob.description?.trim() || "Full job description will be shared during the hiring process."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 bg-slate-950/80 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setJdJob(null)}
                  className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setJdJob(null);
                    openApply(jdJob);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400"
                >
                  Apply now
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Apply modal */}
      <AnimatePresence>
        {applyJob && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
              <button
                type="button"
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                aria-label="Close apply form"
                onClick={closeApply}
              />
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, y: 48 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 32 }}
              transition={{ type: "spring", damping: 24, stiffness: 280 }}
              className="relative z-10 flex max-h-[min(92vh,920px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-slate-900 shadow-2xl sm:max-w-xl sm:rounded-3xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">Apply</h3>
                  <p className="text-xs text-slate-400">All fields marked * are required</p>
                </div>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={closeApply}
                  className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={onApplySubmit} className="relative min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {/* Honeypot */}
                <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0" aria-hidden>
                  <label htmlFor={`${baseId}-hp`}>Company website</label>
                  <input id={`${baseId}-hp`} name="company_site" type="text" tabIndex={-1} autoComplete="off" />
                </div>

                {formError && (
                  <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                    {formError}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-slate-400">Role *</label>
                    <input
                      name="role_display"
                      readOnly
                      value={applyJob.title}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-slate-200 outline-none ring-indigo-500/0 focus:ring-2"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400">Full name *</label>
                    <input
                      required
                      name="full_name"
                      value={form.full_name}
                      onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/60"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-slate-400">Email *</label>
                      <input
                        required
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/60"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-400">Phone *</label>
                      <input
                        required
                        name="phone"
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/60"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400">Professional experience *</label>
                    <textarea
                      required
                      minLength={20}
                      name="experience"
                      rows={3}
                      value={form.experience}
                      onChange={(e) => setForm((f) => ({ ...f, experience: e.target.value }))}
                      placeholder="Roles, skills, key achievements…"
                      className="mt-1 w-full resize-y rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/60"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400">Notice period *</label>
                    <input
                      required
                      name="notice_period"
                      value={form.notice_period}
                      onChange={(e) => setForm((f) => ({ ...f, notice_period: e.target.value }))}
                      placeholder="e.g. 30 days, Immediate"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/60"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-slate-400">Current salary (optional)</label>
                      <input
                        name="current_salary"
                        value={form.current_salary}
                        onChange={(e) => setForm((f) => ({ ...f, current_salary: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/60"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-400">Expected salary (optional)</label>
                      <input
                        name="expected_salary"
                        value={form.expected_salary}
                        onChange={(e) => setForm((f) => ({ ...f, expected_salary: e.target.value }))}
                        className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/60"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400">Location *</label>
                    <input
                      required
                      name="location"
                      value={form.location}
                      onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/60"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-400">
                      <FileText className="h-3.5 w-3.5" />
                      Resume * (PDF, DOC, DOCX — max 5MB)
                    </label>
                    <input
                      required
                      name="resume"
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0] ?? null;
                        setResumeName(file?.name ?? "");
                      }}
                      className="mt-2 w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                    />
                    <div className="mt-1 text-xs text-slate-400">
                      {resumeName ? `Selected: ${resumeName}` : "Choose from Files on iPhone/iCloud/Drive."}
                    </div>
                  </div>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.consent}
                      onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-900 text-indigo-500"
                    />
                    <span>
                      I agree that my details and resume may be processed for this recruitment in line with applicable
                      privacy laws. *
                    </span>
                  </label>
                </div>

                <div className="sticky bottom-0 mt-6 flex justify-end gap-2 border-t border-white/10 bg-slate-900/95 py-4 backdrop-blur">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={closeApply}
                    className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5 disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !form.consent}
                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {submitting ? (
                      <>
                        <Clock className="h-4 w-4 animate-pulse" />
                        Submitting…
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Submit application
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
