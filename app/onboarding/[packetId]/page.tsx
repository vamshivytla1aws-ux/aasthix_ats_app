"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetchJson } from "@/lib/apiClient";

type DocReq = { key: string; label: string };

export default function OnboardingPublicPage() {
  const params = useParams<{ packetId: string }>();
  const search = useSearchParams();
  const packetId = Number(params?.packetId);
  const token = String(search.get("token") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [requiredDocs, setRequiredDocs] = useState<DocReq[]>([]);
  const [meta, setMeta] = useState<{ candidate_name?: string; job_title?: string; status?: string } | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    full_name: "",
    dob: "",
    gender: "",
    contact_number: "",
    personal_email: "",
    current_address: "",
    permanent_address: "",
    emergency_contact: "",
    designation: "",
    department: "",
    reporting_manager: "",
    work_location: "",
    employment_type: "",
    joining_date: "",
    work_mode: "",
    bank_name: "",
    bank_account_holder: "",
    bank_account_number: "",
    bank_ifsc: "",
    bank_branch: "",
    declaration_name: "",
    declaration_date: "",
  });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      if (!Number.isFinite(packetId) || !token) {
        setError("Invalid onboarding link.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetchJson<{
          packet: any;
          payload: Record<string, unknown> | null;
          required_documents: DocReq[];
        }>(`/api/onboarding/${packetId}/public?token=${encodeURIComponent(token)}`);
        setRequiredDocs(data.required_documents || []);
        setMeta(data.packet || null);
        if (data.payload) {
          setForm((prev) => ({ ...prev, ...(data.payload as Record<string, string>) }));
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load onboarding form.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [packetId, token]);

  const missingDocs = useMemo(
    () => requiredDocs.filter((d) => !files[d.key]),
    [requiredDocs, files]
  );

  async function submit() {
    if (missingDocs.length > 0) {
      setError(`Please upload all required documents (${missingDocs.length} missing).`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("payload", JSON.stringify(form));
      for (const d of requiredDocs) {
        const f = files[d.key];
        if (f) fd.set(`doc_${d.key}`, f);
      }
      await fetch(`/api/onboarding/${packetId}/public/submit?token=${encodeURIComponent(token)}`, {
        method: "POST",
        body: fd,
      }).then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error || "Submission failed");
        }
      });
      setOk(true);
    } catch (e: any) {
      setError(e?.message || "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-4xl p-6 text-sm text-slate-600">Loading onboarding form…</div>;
  if (error && !meta) return <div className="mx-auto max-w-4xl p-6 text-sm text-rose-700">{error}</div>;
  if (ok) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          Onboarding form submitted successfully. Thank you.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-xl font-semibold text-slate-900">Employee Onboarding Form</div>
        <div className="mt-1 text-sm text-slate-600">
          {meta?.candidate_name || "Candidate"} · {meta?.job_title || "Selected role"}
        </div>
      </div>
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">Personal Information</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ["full_name", "Full Name"],
            ["dob", "Date of Birth"],
            ["gender", "Gender"],
            ["contact_number", "Contact Number"],
            ["personal_email", "Personal Email ID"],
            ["emergency_contact", "Emergency Contact Name & Number"],
            ["current_address", "Current Address"],
            ["permanent_address", "Permanent Address"],
          ].map(([key, label]) => (
            <label key={key} className="text-xs text-slate-600">
              {label}
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form[key] || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">Employment Details</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ["designation", "Position / Designation"],
            ["department", "Department"],
            ["reporting_manager", "Reporting Manager"],
            ["work_location", "Work Location"],
            ["employment_type", "Employment Type"],
            ["joining_date", "Joining Date"],
            ["work_mode", "Work Mode"],
          ].map(([key, label]) => (
            <label key={key} className="text-xs text-slate-600">
              {label}
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form[key] || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">Required Documents</div>
        <div className="mt-3 grid grid-cols-1 gap-3">
          {requiredDocs.map((d) => (
            <label key={d.key} className="text-xs text-slate-600">
              {d.label}
              <input
                type="file"
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                onChange={(e) =>
                  setFiles((prev) => ({ ...prev, [d.key]: e.target.files?.[0] || null }))
                }
              />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">Bank Details</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            ["bank_name", "Bank Name"],
            ["bank_account_holder", "Account Holder Name"],
            ["bank_account_number", "Account Number"],
            ["bank_ifsc", "IFSC Code"],
            ["bank_branch", "Branch Name"],
          ].map(([key, label]) => (
            <label key={key} className="text-xs text-slate-600">
              {label}
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={form[key] || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">Education / Employment / References</div>
        <div className="mt-2 text-xs text-slate-500">
          Add your tabular details in these fields (matching Education_EMP template).
        </div>
        <label className="mt-3 block text-xs text-slate-600">
          Education details
          <textarea
            className="mt-1 h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.education_details || ""}
            onChange={(e) => setForm((prev) => ({ ...prev, education_details: e.target.value }))}
          />
        </label>
        <label className="mt-3 block text-xs text-slate-600">
          Previous employment details
          <textarea
            className="mt-1 h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.previous_employment || ""}
            onChange={(e) => setForm((prev) => ({ ...prev, previous_employment: e.target.value }))}
          />
        </label>
        <label className="mt-3 block text-xs text-slate-600">
          Professional references
          <textarea
            className="mt-1 h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={form.references || ""}
            onChange={(e) => setForm((prev) => ({ ...prev, references: e.target.value }))}
          />
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">HR Declaration</div>
        <div className="mt-2 text-xs text-slate-600">
          I confirm that the information provided above is true and correct to the best of my knowledge.
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">
            Employee Signature (typed name)
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.declaration_name || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, declaration_name: e.target.value }))}
            />
          </label>
          <label className="text-xs text-slate-600">
            Date
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.declaration_date || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, declaration_date: e.target.value }))}
            />
          </label>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={submitting}
        className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {submitting ? "Submitting..." : "Submit onboarding form"}
      </button>
    </div>
  );
}
