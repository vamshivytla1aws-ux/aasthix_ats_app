"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
  FileUp,
  IndianRupee,
  Linkedin,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  User,
  Globe,
  Clock,
  X,
  Plus,
  CheckCircle2,
} from "lucide-react";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { UI } from "@/lib/ui";
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
  current_salary?: number | null;
  expected_salary?: number | null;
  notice_period?: string | null;
};

type Client = { id: number; name: string };
type Job = { id: number; title: string; company?: string | null; vendor_id?: number | null };

const CANDIDATE_DRAFT_KEY = "ats:candidateform-draft-v1";

const INDIA_CITY_ALIASES = [
  "ahmedabad",
  "bangalore",
  "bengaluru",
  "bombay",
  "calcutta",
  "chandigarh",
  "chennai",
  "coimbatore",
  "cochin",
  "delhi",
  "greater noida",
  "gurgaon",
  "gurugram",
  "hyderabad",
  "indore",
  "jaipur",
  "kochi",
  "kolkata",
  "lucknow",
  "madras",
  "mumbai",
  "mysore",
  "mysuru",
  "navi mumbai",
  "new delhi",
  "noida",
  "poona",
  "pune",
  "secunderabad",
  "thiruvananthapuram",
  "trivandrum",
  "visakhapatnam",
  "vizag",
];

function sanitizeLocationForForm(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase().replace(/[^a-z0-9, ]+/g, " ").replace(/\s+/g, " ").trim();
  if (
    /\b(from multiple data sources|years? of experience|requirements?|power bi|sql server|qlik|data modelling|data visualization|etl|developer|engineer|skills?)\b/i.test(
      normalized
    )
  ) {
    return "";
  }
  if (/^[a-z\s]{25,}$/.test(normalized) && !normalized.includes(",")) {
    return "";
  }
  if (INDIA_CITY_ALIASES.some((city) => normalized.includes(city))) {
    return raw;
  }
  if (/^(remote|hybrid|onsite)$/i.test(raw)) return raw;
  if (raw.includes(",") && raw.split(",").every((part) => part.trim().length > 1 && part.trim().length <= 30)) {
    return raw;
  }
  return "";
}

const sectionTitle = "text-xs font-bold uppercase tracking-wider text-slate-500";
const sectionCard =
  "rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.02] sm:p-5";
const fieldHint = "mt-1 text-xs text-slate-500 leading-relaxed";

function SectionHeader({
  step,
  icon: Icon,
  title,
  description,
}: {
  step: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-3.5 flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-xs font-bold text-white shadow-md shadow-blue-600/20">
        {step}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-blue-600" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-600">{description}</p>
      </div>
    </div>
  );
}

export default function CandidateForm({
  onCreated,
  initialCandidate,
  mode = "create",
  onCancel,
}: {
  onCreated: (candidate: Candidate) => void;
  initialCandidate?: Candidate | null;
  mode?: "create" | "edit";
  onCancel?: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [location, setLocation] = useState("");
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillDraft, setSkillDraft] = useState("");
  const [currentSalary, setCurrentSalary] = useState("");
  const [expectedSalary, setExpectedSalary] = useState("");
  const [noticePreset, setNoticePreset] = useState("Immediate");
  const [noticeCustom, setNoticeCustom] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [compactMode, setCompactMode] = useState(true);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error"; requestId?: string } | null>(null);
  const [draftBanner, setDraftBanner] = useState<{ savedAt: string } | null>(null);

  useEffect(() => {
    if (!initialCandidate) return;
    setFullName(initialCandidate.full_name ?? "");
    setEmail(initialCandidate.email ?? "");
    setPhone(initialCandidate.phone ?? "");
    setLinkedinUrl(initialCandidate.linkedin_url ?? "");
    setWebsiteUrl(initialCandidate.website_url ?? "");
    setLocation(initialCandidate.location ?? "");
    setResumeUrl(initialCandidate.resume_url ?? null);
    setSkills(
      (initialCandidate.skills ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    setSkillDraft("");
    setCurrentSalary(
      initialCandidate.current_salary === null || initialCandidate.current_salary === undefined
        ? ""
        : String(initialCandidate.current_salary)
    );
    setExpectedSalary(
      initialCandidate.expected_salary === null || initialCandidate.expected_salary === undefined
        ? ""
        : String(initialCandidate.expected_salary)
    );
    const np = (initialCandidate.notice_period || "").trim();
    if (!np) {
      setNoticePreset("Immediate");
      setNoticeCustom("");
    } else if (["Immediate", "15 Days", "30 Days", "45 Days", "60 Days", "90 Days"].includes(np)) {
      setNoticePreset(np);
      setNoticeCustom("");
    } else {
      setNoticePreset("Custom");
      setNoticeCustom(np);
    }
  }, [initialCandidate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [v, j] = await Promise.all([apiFetchJson<Client[]>("/api/clients"), apiFetchJson<Job[]>("/api/jobs")]);
        if (cancelled) return;
        setClients(v);
        setJobs(j);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredJobs = useMemo(() => {
    if (!selectedVendorId) return jobs;
    const vid = Number(selectedVendorId);
    if (!Number.isFinite(vid)) return jobs;
    return jobs.filter((j) => (j.vendor_id ?? null) === vid);
  }, [jobs, selectedVendorId]);

  useEffect(() => {
    setSelectedJobId("");
  }, [selectedVendorId]);

  const isCreateIntake = mode === "create" && !initialCandidate?.id;

  useEffect(() => {
    if (!isCreateIntake) {
      setDraftBanner(null);
      return;
    }
    try {
      const raw = window.localStorage.getItem(CANDIDATE_DRAFT_KEY);
      if (!raw) {
        setDraftBanner(null);
        return;
      }
      const d = JSON.parse(raw) as Record<string, unknown>;
      const hasContent =
        (typeof d.fullName === "string" && d.fullName.trim()) || (typeof d.email === "string" && d.email.trim());
      setDraftBanner(hasContent ? { savedAt: typeof d.savedAt === "string" ? d.savedAt : "" } : null);
    } catch {
      setDraftBanner(null);
    }
  }, [isCreateIntake]);

  useEffect(() => {
    if (!isCreateIntake) return;
    const t = window.setTimeout(() => {
      const hasContent =
        fullName.trim().length > 0 ||
        email.trim().length > 0 ||
        phone.trim().length > 0 ||
        location.trim().length > 0;
      if (!hasContent) return;
      try {
        window.localStorage.setItem(
          CANDIDATE_DRAFT_KEY,
          JSON.stringify({
            fullName,
            email,
            phone,
            linkedinUrl,
            websiteUrl,
            location,
            skills,
            currentSalary,
            expectedSalary,
            noticePreset,
            noticeCustom,
            selectedVendorId,
            selectedJobId,
            savedAt: new Date().toISOString(),
          })
        );
      } catch {
        /* ignore */
      }
    }, 1000);
    return () => window.clearTimeout(t);
  }, [
    isCreateIntake,
    fullName,
    email,
    phone,
    linkedinUrl,
    websiteUrl,
    location,
    skills,
    currentSalary,
    expectedSalary,
    noticePreset,
    noticeCustom,
    selectedVendorId,
    selectedJobId,
  ]);

  function restoreCandidateDraft() {
    try {
      const raw = window.localStorage.getItem(CANDIDATE_DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Record<string, unknown>;
      if (typeof d.fullName === "string") setFullName(d.fullName);
      if (typeof d.email === "string") setEmail(d.email);
      if (typeof d.phone === "string") setPhone(d.phone);
      if (typeof d.linkedinUrl === "string") setLinkedinUrl(d.linkedinUrl);
      if (typeof d.websiteUrl === "string") setWebsiteUrl(d.websiteUrl);
      if (typeof d.location === "string") setLocation(d.location);
      if (Array.isArray(d.skills)) setSkills(d.skills.filter((x): x is string => typeof x === "string"));
      if (typeof d.currentSalary === "string") setCurrentSalary(d.currentSalary);
      if (typeof d.expectedSalary === "string") setExpectedSalary(d.expectedSalary);
      if (typeof d.noticePreset === "string") setNoticePreset(d.noticePreset);
      if (typeof d.noticeCustom === "string") setNoticeCustom(d.noticeCustom);
      if (typeof d.selectedVendorId === "string") setSelectedVendorId(d.selectedVendorId);
      if (typeof d.selectedJobId === "string") setSelectedJobId(d.selectedJobId);
    } catch {
      /* ignore */
    }
    setDraftBanner(null);
  }

  function discardCandidateDraft() {
    try {
      window.localStorage.removeItem(CANDIDATE_DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setDraftBanner(null);
  }

  function addSkillFromDraft() {
    const t = skillDraft.trim();
    if (!t) return;
    const parts = t.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    setSkills((prev) => {
      const set = new Set(prev.map((x) => x.toLowerCase()));
      const next = [...prev];
      for (const p of parts) {
        if (!set.has(p.toLowerCase())) {
          set.add(p.toLowerCase());
          next.push(p);
        }
      }
      return next;
    });
    setSkillDraft("");
  }

  function removeSkill(s: string) {
    setSkills((prev) => prev.filter((x) => x !== s));
  }

  async function handleParseResume() {
    if (!resumeFile) return;
    setParsing(true);
    setToast(null);
    try {
      const fd = new FormData();
      fd.append("file", resumeFile);
      const parsed = await apiFetchJson<{
        full_name: string | null;
        email: string | null;
        phone: string | null;
        location: string | null;
        linkedin_url: string | null;
        resume_url?: string | null;
        skills?: string | null;
      }>("/api/resume/parse", { method: "POST", body: fd });

      if (parsed.full_name) setFullName(parsed.full_name);
      if (parsed.email) setEmail(parsed.email);
      if (parsed.phone) setPhone(parsed.phone);
      setLocation(sanitizeLocationForForm(parsed.location));
      if (parsed.linkedin_url) setLinkedinUrl(parsed.linkedin_url);
      if (parsed.resume_url) setResumeUrl(parsed.resume_url);
      if (parsed.skills) {
        const items = parsed.skills.split(",").map((s) => s.trim()).filter(Boolean);
        setSkills((prev) => {
          const set = new Set(prev.map((x) => x.toLowerCase()));
          const next = [...prev];
          for (const p of items) {
            if (!set.has(p.toLowerCase())) {
              set.add(p.toLowerCase());
              next.push(p);
            }
          }
          return next;
        });
      }
      setToast({ message: "Resume parsed — review and adjust fields below.", variant: "success" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to parse resume";
      const rid = err instanceof ApiError ? err.requestId : undefined;
      setToast({ message: msg, variant: "error", requestId: rid });
    } finally {
      setParsing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setToast(null);
    try {
      const isEdit = mode === "edit" && !!initialCandidate?.id;
      const created = await apiFetchJson<Candidate>("/api/candidates", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: isEdit ? initialCandidate!.id : undefined,
          full_name: fullName,
          email,
          phone: phone || null,
          linkedin_url: linkedinUrl || null,
          website_url: websiteUrl || null,
          location: location || null,
          resume_url: resumeUrl || null,
          skills: skills.length > 0 ? skills.join(", ") : null,
          current_salary: currentSalary.trim().length ? Number(currentSalary) : null,
          expected_salary: expectedSalary.trim().length ? Number(expectedSalary) : null,
          notice_period:
            noticePreset === "Custom" ? noticeCustom.trim() || null : noticePreset || null,
        }),
      });

      if (!isEdit && selectedJobId) {
        await apiFetchJson("/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate_id: created.id,
            job_id: Number(selectedJobId),
            stage: "Applied",
          }),
        });
      }

      onCreated(created);
      if (isEdit) {
        setToast({ message: "Candidate updated successfully.", variant: "success" });
      } else {
        try {
          window.localStorage.removeItem(CANDIDATE_DRAFT_KEY);
        } catch {
          /* ignore */
        }
        setDraftBanner(null);
        setFullName("");
        setEmail("");
        setPhone("");
        setLinkedinUrl("");
        setWebsiteUrl("");
        setLocation("");
        setResumeUrl(null);
        setResumeFile(null);
        setSkills([]);
        setSkillDraft("");
        setCurrentSalary("");
        setExpectedSalary("");
        setNoticePreset("Immediate");
        setNoticeCustom("");
        setSelectedVendorId("");
        setSelectedJobId("");
        setToast({ message: "Candidate added to your talent pool.", variant: "success" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      const rid = err instanceof ApiError ? err.requestId : undefined;
      setToast({ message: msg, variant: "error", requestId: rid });
    } finally {
      setSubmitting(false);
    }
  }

  const resumeFileLabel = resumeFile?.name ?? null;
  const isBusy = submitting || parsing;

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          requestId={toast.requestId}
          onClose={() => setToast(null)}
          autoHideMs={toast.variant === "error" ? 5200 : 2500}
        />
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white shadow-sm">
        {/* Top bar */}
        <div className="border-b border-slate-200/80 bg-white/90 px-4 py-3.5 backdrop-blur-sm sm:px-6 sm:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-100">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                {mode === "edit" ? "Edit profile" : "Talent intake"}
              </div>
              <h2 className="mt-2 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                {mode === "edit" ? "Edit candidate" : "Add candidate"}
              </h2>
              <p className="mt-1 max-w-2xl text-xs text-slate-600">
                Upload a resume to auto-fill fields, then refine details. Name and email are required to save.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => setCompactMode(true)}
                  className={[
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    compactMode ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                >
                  Compact
                </button>
                <button
                  type="button"
                  onClick={() => setCompactMode(false)}
                  className={[
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                    !compactMode ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-50",
                  ].join(" ")}
                >
                  Detailed
                </button>
              </div>
              {mode === "edit" && onCancel ? (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isBusy}
                  className="shrink-0 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {isCreateIntake && draftBanner ? (
          <div className="border-b border-indigo-100 bg-indigo-50/90 px-4 py-3 dark:border-indigo-900 dark:bg-indigo-950/50 sm:px-6">
            <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-indigo-950 dark:text-indigo-100">
                Unsaved draft
                {draftBanner.savedAt ? ` · saved ${new Date(draftBanner.savedAt).toLocaleString()}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={UI.secondaryButton + " py-1.5 text-xs"}
                  onClick={restoreCandidateDraft}
                >
                  Restore draft
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 dark:border-indigo-600 dark:text-indigo-200 dark:hover:bg-indigo-900/50"
                  onClick={discardCandidateDraft}
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="p-4 sm:p-5">
          <div className="mx-auto max-w-4xl space-y-4">
            {compactMode ? (
              <section className={sectionCard} aria-labelledby="cand-sec-compact">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 id="cand-sec-compact" className="text-sm font-semibold text-slate-900">
                    Review candidate fields before save
                  </h3>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                    Minimal scroll
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={UI.label}>Resume</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <label
                        htmlFor="resume-file"
                        className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50/50"
                      >
                        <FileUp className="h-4 w-4" aria-hidden />
                        {resumeFileLabel ? resumeFileLabel : "Select PDF/DOCX"}
                      </label>
                      <button
                        type="button"
                        onClick={handleParseResume}
                        disabled={!resumeFile || isBusy}
                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-45"
                      >
                        {parsing ? "Parsing..." : "Parse & fill"}
                      </button>
                      {resumeUrl ? (
                        <a className="text-xs font-semibold text-blue-700 hover:underline" href={resumeUrl} target="_blank" rel="noreferrer">
                          View resume
                        </a>
                      ) : null}
                    </div>
                    <input
                      id="resume-file"
                      type="file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="sr-only"
                      onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                      disabled={isBusy}
                    />
                  </div>

                  <div>
                    <label className={UI.label}>Full name *</label>
                    <input className={UI.input} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  </div>
                  <div>
                    <label className={UI.label}>Email *</label>
                    <input type="email" className={UI.input} value={email} onChange={(e) => setEmail(e.target.value)} required />
                    <p className={fieldHint}>PII · use a deliverable address; subject to your org&apos;s privacy and retention policy.</p>
                  </div>
                  <div>
                    <label className={UI.label}>Phone</label>
                    <input className={UI.input} value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                  <div>
                    <label className={UI.label}>Location</label>
                    <input className={UI.input} value={location} onChange={(e) => setLocation(e.target.value)} />
                  </div>
                  <div>
                    <label className={UI.label}>LinkedIn</label>
                    <input className={UI.input} value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} />
                  </div>
                  <div>
                    <label className={UI.label}>Website</label>
                    <input className={UI.input} value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-2">
                    <label className={UI.label}>Skills (comma separated)</label>
                    <input
                      className={UI.input}
                      value={skills.join(", ")}
                      onChange={(e) =>
                        setSkills(
                          e.target.value
                            .split(",")
                            .map((x) => x.trim())
                            .filter(Boolean)
                        )
                      }
                    />
                  </div>
                  <div>
                    <label className={UI.label}>Current salary</label>
                    <input inputMode="numeric" className={UI.input} value={currentSalary} onChange={(e) => setCurrentSalary(e.target.value)} />
                    <p className={fieldHint}>Sensitive · internal use only; confirm local rules before sharing with clients.</p>
                  </div>
                  <div>
                    <label className={UI.label}>Expected salary</label>
                    <input inputMode="numeric" className={UI.input} value={expectedSalary} onChange={(e) => setExpectedSalary(e.target.value)} />
                    <p className={fieldHint}>Document source (e.g. candidate stated) for audit if required.</p>
                  </div>
                  <div>
                    <label className={UI.label}>Notice period</label>
                    <select className={UI.select} value={noticePreset} onChange={(e) => setNoticePreset(e.target.value)} disabled={isBusy}>
                      <option value="Immediate">Immediate</option>
                      <option value="15 Days">15 Days</option>
                      <option value="30 Days">30 Days</option>
                      <option value="45 Days">45 Days</option>
                      <option value="60 Days">60 Days</option>
                      <option value="90 Days">90 Days</option>
                      <option value="Custom">Custom</option>
                    </select>
                    {noticePreset === "Custom" ? (
                      <input
                        className={[UI.input, "mt-2"].join(" ")}
                        value={noticeCustom}
                        onChange={(e) => setNoticeCustom(e.target.value)}
                        placeholder="e.g. 20 days / negotiable"
                        disabled={isBusy}
                      />
                    ) : null}
                  </div>
                  <div>
                    <label className={UI.label}>Client filter</label>
                    <select className={UI.select} value={selectedVendorId} onChange={(e) => setSelectedVendorId(e.target.value)} disabled={isBusy || mode === "edit"}>
                      <option value="">No client filter</option>
                      {clients.map((v) => (
                        <option key={v.id} value={String(v.id)}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={UI.label}>Apply to role</label>
                    <select className={UI.select} value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)} disabled={isBusy || mode === "edit"}>
                      <option value="">None — save candidate only</option>
                      {filteredJobs.map((j) => (
                        <option key={j.id} value={String(j.id)}>
                          {j.title}
                          {j.company ? ` · ${j.company}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>
            ) : (
              <>
            {/* 01 Resume */}
            <section className={sectionCard} aria-labelledby="cand-sec-resume">
              <SectionHeader
                step="01"
                icon={FileUp}
                title="Resume & parsing"
                description="PDF or Word — we extract contact info and skills. You stay in control of every field."
              />
              <div className="grid gap-6 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <label className={sectionTitle} htmlFor="resume-file">
                    File
                  </label>
                  <div className="mt-2">
                    <label
                      htmlFor="resume-file"
                      className="flex min-h-[92px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-4 text-center transition hover:border-blue-300 hover:bg-blue-50/30"
                    >
                      <FileUp className="h-8 w-8 text-slate-400" aria-hidden />
                      <span className="mt-2 text-sm font-medium text-slate-700">
                        {resumeFileLabel ? resumeFileLabel : "Drop file or click to browse"}
                      </span>
                      <span className="mt-1 text-xs text-slate-500">PDF, DOCX · max typical resume size</span>
                    </label>
                    <input
                      id="resume-file"
                      type="file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="sr-only"
                      onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                      disabled={isBusy}
                    />
                  </div>
                  {resumeUrl ? (
                    <div className="mt-3 flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
                      <a className="font-medium text-blue-700 hover:underline" href={resumeUrl} target="_blank" rel="noreferrer">
                        View stored resume
                      </a>
                    </div>
                  ) : null}
                  <p className={fieldHint}>Parsing uses your configured engine (AI + rules). Always verify before saving.</p>
                </div>
                <div className="flex flex-col justify-end lg:col-span-5">
                  <button
                    type="button"
                    onClick={handleParseResume}
                    disabled={!resumeFile || isBusy}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:pointer-events-none disabled:opacity-45"
                  >
                    {parsing ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <Sparkles className="h-4 w-4" aria-hidden />
                    )}
                    {parsing ? "Parsing resume…" : "Parse & fill fields"}
                  </button>
                </div>
              </div>
            </section>

            {/* 02 Identity */}
            <section className={sectionCard} aria-labelledby="cand-sec-identity">
              <SectionHeader
                step="02"
                icon={User}
                title="Identity & contact"
                description="How you and clients will reach this candidate."
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={UI.label}>
                    <span className="inline-flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      Full name
                    </span>
                    <span className="text-rose-600"> *</span>
                  </label>
                  <input
                    className={UI.input}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder="e.g. Priya Sharma"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label className={UI.label}>
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      Work email
                    </span>
                    <span className="text-rose-600"> *</span>
                  </label>
                  <input
                    type="email"
                    className={UI.input}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="name@company.com"
                    autoComplete="email"
                  />
                  <p className={fieldHint}>PII · must be accurate for applications and compliance exports.</p>
                </div>
                <div>
                  <label className={UI.label}>
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      Phone
                    </span>
                  </label>
                  <input
                    className={UI.input}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 …"
                    autoComplete="tel"
                  />
                </div>
                <div>
                  <label className={UI.label}>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      Location
                    </span>
                  </label>
                  <input
                    className={UI.input}
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="City, Country"
                  />
                </div>
                <div>
                  <label className={UI.label}>
                    <span className="inline-flex items-center gap-1.5">
                      <Linkedin className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      LinkedIn
                    </span>
                  </label>
                  <input
                    type="url"
                    className={UI.input}
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/…"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={UI.label}>
                    <span className="inline-flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      Website / portfolio
                    </span>
                  </label>
                  <input
                    type="url"
                    className={UI.input}
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
              </div>
            </section>

            {/* 03 Skills */}
            <section className={sectionCard} aria-labelledby="cand-sec-skills">
              <SectionHeader
                step="03"
                icon={Briefcase}
                title="Skills & keywords"
                description="Used for search, JD matching, and client submissions. Add manually or from resume parse."
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label className={UI.label} htmlFor="skill-input">
                    Add skills
                  </label>
                  <input
                    id="skill-input"
                    className={UI.input}
                    value={skillDraft}
                    onChange={(e) => setSkillDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSkillFromDraft();
                      }
                    }}
                    placeholder="e.g. React, TypeScript — comma separated or press Enter"
                    disabled={isBusy}
                  />
                </div>
                <button
                  type="button"
                  onClick={addSkillFromDraft}
                  disabled={!skillDraft.trim() || isBusy}
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-45"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  Add
                </button>
              </div>
              {skills.length > 0 ? (
                <div className="mt-4">
                  <p className={sectionTitle}>Skill tags ({skills.length})</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {skills.map((s) => (
                      <span
                        key={s}
                        className="group inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-1 text-xs font-semibold text-slate-800"
                      >
                        {s}
                        <button
                          type="button"
                          onClick={() => removeSkill(s)}
                          className="rounded-full p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                          aria-label={`Remove ${s}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className={`${fieldHint} mt-3`}>No skills yet — parse a resume or add tags for stronger matching.</p>
              )}
            </section>

            {/* 04 Compensation */}
            <section className={sectionCard} aria-labelledby="cand-sec-comp">
              <SectionHeader
                step="04"
                icon={IndianRupee}
                title="Compensation & availability"
                description="Helps recruiters and clients align expectations early."
              />
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className={UI.label}>Current salary (annual)</label>
                  <input
                    inputMode="numeric"
                    className={UI.input}
                    value={currentSalary}
                    onChange={(e) => setCurrentSalary(e.target.value)}
                    placeholder="e.g. 1200000"
                  />
                  <p className={fieldHint}>Optional · sensitive compensation data; internal reporting only unless policy allows.</p>
                </div>
                <div>
                  <label className={UI.label}>Expected salary (annual)</label>
                  <input
                    inputMode="numeric"
                    className={UI.input}
                    value={expectedSalary}
                    onChange={(e) => setExpectedSalary(e.target.value)}
                    placeholder="e.g. 1500000"
                  />
                  <p className={fieldHint}>Record expectation source for fair hiring documentation where applicable.</p>
                </div>
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className={UI.label}>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                      Notice period
                    </span>
                  </label>
                  <select
                    className={UI.select}
                    value={noticePreset}
                    onChange={(e) => setNoticePreset(e.target.value)}
                    disabled={isBusy}
                  >
                    <option value="Immediate">Immediate</option>
                    <option value="15 Days">15 Days</option>
                    <option value="30 Days">30 Days</option>
                    <option value="45 Days">45 Days</option>
                    <option value="60 Days">60 Days</option>
                    <option value="90 Days">90 Days</option>
                    <option value="Custom">Custom</option>
                  </select>
                  {noticePreset === "Custom" ? (
                    <input
                      className={[UI.input, "mt-2"].join(" ")}
                      value={noticeCustom}
                      onChange={(e) => setNoticeCustom(e.target.value)}
                      placeholder="e.g. 20 days / negotiable"
                      disabled={isBusy}
                    />
                  ) : null}
                </div>
              </div>
            </section>

            {/* 05 Application */}
            <section className={sectionCard} aria-labelledby="cand-sec-app">
              <SectionHeader
                step="05"
                icon={Building2}
                title="Application routing"
                description="Optionally link this person to a client and open role — creates a pipeline entry as Applied."
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label className={UI.label}>Client</label>
                  <select
                    className={UI.select}
                    value={selectedVendorId}
                    onChange={(e) => setSelectedVendorId(e.target.value)}
                    disabled={isBusy || mode === "edit"}
                  >
                    <option value="">No client filter</option>
                    {clients.map((v) => (
                      <option key={v.id} value={String(v.id)}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  <p className={fieldHint}>Filter jobs by client; leave empty to see all open roles.</p>
                </div>
                <div>
                  <label className={UI.label}>Role to apply</label>
                  <select
                    className={UI.select}
                    value={selectedJobId}
                    onChange={(e) => setSelectedJobId(e.target.value)}
                    disabled={isBusy || mode === "edit"}
                  >
                    <option value="">None — save candidate only</option>
                    {filteredJobs.map((j) => (
                      <option key={j.id} value={String(j.id)}>
                        {j.title}
                        {j.company ? ` · ${j.company}` : ""}
                      </option>
                    ))}
                  </select>
                  {mode === "edit" ? (
                    <p className={fieldHint}>Job linking is available when adding a new candidate.</p>
                  ) : null}
                </div>
              </div>
            </section>
              </>
            )}
          </div>

          {/* Sticky action bar */}
          <div className="mx-auto mt-6 max-w-4xl border-t border-slate-200 pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">*</span> Required fields. Data is scoped to your workspace.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {mode === "edit" && onCancel ? (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                    disabled={isBusy}
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={isBusy}
                  className="inline-flex min-w-[160px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : null}
                  {submitting ? "Saving…" : mode === "edit" ? "Save changes" : "Save candidate"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
