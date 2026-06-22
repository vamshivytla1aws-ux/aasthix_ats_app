"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpenCheck, CheckCircle2, FileText, Send, Sparkles } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

const EMPTY_FORM = {
  full_name: "",
  email: "",
  phone: "",
  consent: false,
};

function sessionKey() {
  try {
    const key = "training_session_id";
    let value = localStorage.getItem(key);
    if (!value) {
      value =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, value);
    }
    return value;
  } catch {
    return "anon";
  }
}

export default function TrainingPublicPortal() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [resumeName, setResumeName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const track = useCallback(async (event_type: string, meta?: Record<string, unknown>) => {
    try {
      await fetch("/api/training/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type,
          session_id: sessionKey(),
          meta: meta || {},
        }),
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void track("view_training_page");
  }, [track]);

  const isDirty = useMemo(
    () => Boolean(form.full_name || form.email || form.phone || form.consent || resumeName),
    [form, resumeName]
  );

  useEffect(() => {
    if (!isDirty || submitting) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, submitting]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    await track("start_training_submit");

    const fd = new FormData(event.currentTarget);
    fd.set("session_id", sessionKey());
    fd.set("consent", form.consent ? "true" : "false");

    try {
      const response = await fetch("/api/training/apply", {
        method: "POST",
        body: fd,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Submission failed");
        setSubmitting(false);
        return;
      }
      window.location.href = "/training/success";
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <a
            href="https://www.aasthix.com"
            className="flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
          >
            <BrandLogo size={44} className="shrink-0 rounded-xl bg-slate-950/70 p-1 ring-1 ring-white/10" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300/90">AASTHIX</p>
              <p className="text-sm text-slate-400">Training intake</p>
            </div>
          </a>
          <Link href="/login" className="text-sm font-medium text-slate-300 underline-offset-4 hover:text-white hover:underline">
            Recruiter sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600/20 via-slate-900/60 to-violet-600/10 p-8 shadow-2xl sm:p-12">
          <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-violet-500/15 blur-3xl" />
          <h1 className="relative text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
            Training registration with resume-based question generation
          </h1>
          <p className="relative mt-4 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Submit your details and resume. We will parse the resume and generate a structured set of basic interview
            questions for training review.
          </p>
        </section>

        <section className="mt-12 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-white/10 bg-slate-900/40 p-8 backdrop-blur-sm">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-white">
              <Sparkles className="h-5 w-5 text-indigo-400" />
              What happens after submission
            </h2>
            <div className="mt-6 space-y-4 text-sm text-slate-300">
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <p>Your resume is stored securely and converted into readable text where possible.</p>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <p>We generate 10–15 basic training/interview questions from your resume using our AI workflow.</p>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <p>The training team reviews your profile and generated question set inside the internal module.</p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-slate-950/60 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <BookOpenCheck className="h-4 w-4 text-indigo-400" />
                Submission requirements
              </div>
              <ul className="mt-3 space-y-2 text-sm text-slate-400">
                <li>Resume must be PDF, DOC, or DOCX and under 5 MB.</li>
                <li>Name, email, and phone are required.</li>
                <li>Text extraction works best with text-based PDFs and DOCX files.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-8 shadow-xl">
            <h2 className="text-xl font-semibold text-white">Submit training profile</h2>
            <p className="mt-2 text-sm text-slate-400">Required fields are marked with an asterisk.</p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0" aria-hidden>
                <label htmlFor="training-company-site">Company website</label>
                <input id="training-company-site" name="company_site" type="text" tabIndex={-1} autoComplete="off" />
              </div>

              {error ? (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}

              <div>
                <label className="text-xs font-medium text-slate-400">Full name *</label>
                <input
                  required
                  name="full_name"
                  value={form.full_name}
                  onChange={(e) => setForm((current) => ({ ...current, full_name: e.target.value }))}
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
                    onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/60"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400">Phone *</label>
                  <input
                    required
                    name="phone"
                    value={form.phone}
                    onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/60"
                  />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-400">
                  <FileText className="h-3.5 w-3.5" />
                  Resume * (PDF, DOC, DOCX)
                </label>
                <input
                  required
                  type="file"
                  name="resume"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0] ?? null;
                    setResumeName(file?.name ?? "");
                  }}
                  className="mt-2 w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-500 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                />
                <div className="mt-1 text-xs text-slate-400">{resumeName ? `Selected: ${resumeName}` : "Choose your resume file."}</div>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => setForm((current) => ({ ...current, consent: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-900 text-indigo-500"
                />
                <span>
                  I agree that my details and resume may be processed for training evaluation and question generation. *
                </span>
              </label>
              <button
                type="submit"
                disabled={submitting || !form.consent}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
                {submitting ? "Submitting..." : "Submit training profile"}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

