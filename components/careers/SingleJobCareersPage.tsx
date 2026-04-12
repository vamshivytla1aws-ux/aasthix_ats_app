"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Calendar, Clock3, MapPin, Send, Sparkles } from "lucide-react";
import type { PublicCareersJob } from "@/lib/careersPublicJob";

function formatPosted(d: string | null) {
  if (!d) return "Recently posted";
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
    const key = "careers_session_id";
    let value = localStorage.getItem(key);
    if (!value) {
      value =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, value);
    }
    return value;
  } catch {
    return "anon";
  }
}

function heroDescription(job: PublicCareersJob) {
  const parts = [
    job.location?.trim(),
    job.employment_type?.trim(),
    job.experience_requirement?.trim(),
  ].filter(Boolean);
  return parts.length > 0
    ? parts.join(" • ")
    : "Explore the role details below and apply directly in a few minutes.";
}

export default function SingleJobCareersPage({ job }: { job: PublicCareersJob }) {
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    experience: "",
    notice_period: "",
    current_salary: "",
    expected_salary: "",
    location: "",
    consent: false,
  });

  const track = useCallback(async (eventType: string, meta?: Record<string, unknown>) => {
    try {
      await fetch("/api/careers/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: eventType,
          job_id: job.id,
          session_id: sessionKey(),
          meta,
        }),
      });
    } catch {
      // ignore analytics failures on public page
    }
  }, [job.id]);

  useEffect(() => {
    void track("open_public_page", { page: "single_job_share" });
    void track("view_jd", { page: "single_job_share" });
  }, [track]);

  const summaryLine = useMemo(() => heroDescription(job), [job]);

  async function onApplySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("job_id", String(job.id));
    fd.set("role_title", job.title);
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
      await track("submit_success", { page: "single_job_share" });
      const title = encodeURIComponent(String(data.job_title || job.title || ""));
      window.location.href = `/careers/success?title=${title}`;
    } catch {
      setFormError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300/90">AASTHIX</p>
              <p className="text-sm text-slate-400">Direct job application</p>
            </div>
          </div>
          <Link
            href="/careers"
            className="text-sm font-medium text-slate-300 underline-offset-4 hover:text-white hover:underline"
          >
            View all open jobs
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:py-14">
        <section className="space-y-6">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600/20 via-slate-900/60 to-violet-600/10 p-8 shadow-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-200">
              Public share link
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">{job.title}</h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-300">{summaryLine}</p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <MapPin className="h-4 w-4 text-indigo-300" />
                {job.location}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <Clock3 className="h-4 w-4 text-indigo-300" />
                {job.employment_type?.trim() || "Employment type not specified"}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <Calendar className="h-4 w-4 text-indigo-300" />
                {formatPosted(job.created_at)}
              </span>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-8 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-white">Job description</h2>
                <p className="mt-1 text-sm text-slate-400">Review the role details and apply directly below.</p>
              </div>
              {job.experience_requirement?.trim() ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                  <span className="block text-xs uppercase tracking-[0.12em] text-slate-500">Experience</span>
                  {job.experience_requirement}
                </div>
              ) : null}
            </div>
            <div className="prose prose-invert mt-6 max-w-none whitespace-pre-wrap text-slate-200 prose-headings:text-white prose-strong:text-white">
              {job.description?.trim() || "The detailed role description will be shared during the application review."}
            </div>
          </div>
        </section>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-6 shadow-xl backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Apply for this role</h2>
                <p className="mt-1 text-sm text-slate-400">Your application goes directly to our recruiting team.</p>
              </div>
              <button
                type="button"
                onClick={() => void track("start_apply", { page: "single_job_share", cta: "top" })}
                className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:bg-indigo-400"
              >
                Start
              </button>
            </div>

            <form className="mt-6 space-y-4" onSubmit={onApplySubmit}>
              <input type="hidden" name="company_site" tabIndex={-1} autoComplete="off" className="hidden" />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <span className="text-slate-300">Full name</span>
                  <input
                    required
                    name="full_name"
                    value={form.full_name}
                    onChange={(e) => setForm((s) => ({ ...s, full_name: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-indigo-400"
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="text-slate-300">Email</span>
                  <input
                    required
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-indigo-400"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <span className="text-slate-300">Phone</span>
                  <input
                    required
                    name="phone"
                    value={form.phone}
                    onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-indigo-400"
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="text-slate-300">Current location</span>
                  <input
                    required
                    name="location"
                    value={form.location}
                    onChange={(e) => setForm((s) => ({ ...s, location: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-indigo-400"
                  />
                </label>
              </div>

              <label className="space-y-1.5 text-sm">
                <span className="text-slate-300">Experience summary</span>
                <textarea
                  required
                  name="experience"
                  rows={4}
                  value={form.experience}
                  onChange={(e) => setForm((s) => ({ ...s, experience: e.target.value }))}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-indigo-400"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <span className="text-slate-300">Notice period</span>
                  <input
                    required
                    name="notice_period"
                    value={form.notice_period}
                    onChange={(e) => setForm((s) => ({ ...s, notice_period: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-indigo-400"
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="text-slate-300">Resume</span>
                  <input
                    required
                    type="file"
                    name="resume"
                    accept=".pdf,.doc,.docx"
                    onClick={() => void track("start_apply", { page: "single_job_share", cta: "resume_upload" })}
                    className="block w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-indigo-400"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm">
                  <span className="text-slate-300">Current salary</span>
                  <input
                    name="current_salary"
                    value={form.current_salary}
                    onChange={(e) => setForm((s) => ({ ...s, current_salary: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-indigo-400"
                  />
                </label>
                <label className="space-y-1.5 text-sm">
                  <span className="text-slate-300">Expected salary</span>
                  <input
                    name="expected_salary"
                    value={form.expected_salary}
                    onChange={(e) => setForm((s) => ({ ...s, expected_salary: e.target.value }))}
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-white outline-none ring-0 placeholder:text-slate-500 focus:border-indigo-400"
                  />
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                <input
                  required
                  type="checkbox"
                  name="consent"
                  checked={form.consent}
                  onChange={(e) => setForm((s) => ({ ...s, consent: e.target.checked }))}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-950/60 text-indigo-500"
                />
                <span>I agree to the secure processing of my application data for this hiring process.</span>
              </label>

              {formError ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {formError}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                onClick={() => void track("start_apply", { page: "single_job_share", cta: "submit_button" })}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Send className="h-4 w-4" />
                {submitting ? "Submitting application..." : "Apply now"}
              </button>
            </form>
          </div>
        </aside>
      </main>
    </div>
  );
}
