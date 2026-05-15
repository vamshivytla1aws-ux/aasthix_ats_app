"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetchJson } from "@/lib/apiClient";

type DocReq = { key: string; label: string };

type EducationRow = {
  education: string;
  institute: string;
  from: string;
  to: string;
  specialization: string;
  percentage: string;
};

type EmploymentRow = {
  employer: string;
  empId: string;
  from: string;
  to: string;
  designation: string;
  salary: string;
};

type ReferenceRow = {
  nameDesignation: string;
  emailPhone: string;
  association: string;
};

const EDUCATION_BASE_ROWS = [
  "Matriculation/SSC/Equivalent",
  "Intermediate/HSC/Equivalent",
  "Diploma/Equivalent",
  "Graduation/Equivalent",
  "Post-Graduation/Equivalent",
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyEmploymentRow(): EmploymentRow {
  return { employer: "", empId: "", from: "", to: "", designation: "", salary: "" };
}

function emptyReferenceRow(): ReferenceRow {
  return { nameDesignation: "", emailPhone: "", association: "" };
}

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
    date_of_birth: "",
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
    declaration_date: todayIso(),
  });
  const [educationRows, setEducationRows] = useState<EducationRow[]>(
    EDUCATION_BASE_ROWS.map((label) => ({
      education: label,
      institute: "",
      from: "",
      to: "",
      specialization: "",
      percentage: "",
    }))
  );
  const [employmentRows, setEmploymentRows] = useState<EmploymentRow[]>([emptyEmploymentRow()]);
  const [references, setReferences] = useState<ReferenceRow[]>([emptyReferenceRow(), emptyReferenceRow(), emptyReferenceRow()]);
  const [files, setFiles] = useState<Record<string, File[]>>({});
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
          const payload = data.payload as any;
          setForm((prev) => ({
            ...prev,
            ...Object.fromEntries(
              Object.entries(payload).filter(([k, v]) => typeof v === "string").map(([k, v]) => [k, String(v)])
            ),
            declaration_date:
              typeof payload.declaration_date === "string" && payload.declaration_date ? payload.declaration_date : prev.declaration_date,
          }));
          if (Array.isArray(payload.education_rows) && payload.education_rows.length) {
            setEducationRows(
              payload.education_rows.map((r: any, idx: number) => ({
                education: String(r?.education || EDUCATION_BASE_ROWS[idx] || ""),
                institute: String(r?.institute || ""),
                from: String(r?.from || ""),
                to: String(r?.to || ""),
                specialization: String(r?.specialization || ""),
                percentage: String(r?.percentage || ""),
              }))
            );
          }
          if (Array.isArray(payload.previous_employment_rows) && payload.previous_employment_rows.length) {
            setEmploymentRows(
              payload.previous_employment_rows.map((r: any) => ({
                employer: String(r?.employer || ""),
                empId: String(r?.empId || ""),
                from: String(r?.from || ""),
                to: String(r?.to || ""),
                designation: String(r?.designation || ""),
                salary: String(r?.salary || ""),
              }))
            );
          }
          if (Array.isArray(payload.professional_references) && payload.professional_references.length) {
            const base = [emptyReferenceRow(), emptyReferenceRow(), emptyReferenceRow()];
            for (let i = 0; i < 3; i++) {
              const src = payload.professional_references[i];
              if (!src) continue;
              base[i] = {
                nameDesignation: String(src?.nameDesignation || ""),
                emailPhone: String(src?.emailPhone || ""),
                association: String(src?.association || ""),
              };
            }
            setReferences(base);
          }
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load onboarding form.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [packetId, token]);

  const missingDocs = useMemo(() => requiredDocs.filter((d) => !(files[d.key] && files[d.key].length > 0)), [requiredDocs, files]);

  function setField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    if (missingDocs.length > 0) {
      setError(`Please upload all required documents (${missingDocs.length} missing).`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set(
        "payload",
        JSON.stringify({
          ...form,
          education_rows: educationRows,
          previous_employment_rows: employmentRows,
          professional_references: references,
        })
      );
      for (const d of requiredDocs) {
        const docFiles = files[d.key] || [];
        for (const file of docFiles) fd.append(`doc_${d.key}`, file);
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

  if (loading) return <div className="mx-auto max-w-6xl p-6 text-sm text-slate-600">Loading onboarding form…</div>;
  if (error && !meta) return <div className="mx-auto max-w-6xl p-6 text-sm text-rose-700">{error}</div>;
  if (ok) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          Onboarding form submitted successfully. Thank you.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
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
          <label className="text-xs text-slate-600">Full Name<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.full_name || ""} onChange={(e) => setField("full_name", e.target.value)} /></label>
          <label className="text-xs text-slate-600">Date of Birth<input type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.date_of_birth || ""} onChange={(e) => setField("date_of_birth", e.target.value)} /></label>
          <label className="text-xs text-slate-600">Gender
            <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.gender || ""} onChange={(e) => setField("gender", e.target.value)}>
              <option value="">Select</option><option>Male</option><option>Female</option><option>Rather not say</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">Contact Number<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.contact_number || ""} onChange={(e) => setField("contact_number", e.target.value)} /></label>
          <label className="text-xs text-slate-600">Personal Email ID<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.personal_email || ""} onChange={(e) => setField("personal_email", e.target.value)} /></label>
          <label className="text-xs text-slate-600">Emergency Contact<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.emergency_contact || ""} onChange={(e) => setField("emergency_contact", e.target.value)} /></label>
          <label className="text-xs text-slate-600 sm:col-span-2">Current Address<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.current_address || ""} onChange={(e) => setField("current_address", e.target.value)} /></label>
          <label className="text-xs text-slate-600 sm:col-span-2">Permanent Address<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.permanent_address || ""} onChange={(e) => setField("permanent_address", e.target.value)} /></label>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">Employment Details</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">Position / Designation<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.designation || ""} onChange={(e) => setField("designation", e.target.value)} /></label>
          <label className="text-xs text-slate-600">Department<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.department || ""} onChange={(e) => setField("department", e.target.value)} /></label>
          <label className="text-xs text-slate-600">Reporting Manager<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.reporting_manager || ""} onChange={(e) => setField("reporting_manager", e.target.value)} /></label>
          <label className="text-xs text-slate-600">Work Location<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.work_location || ""} onChange={(e) => setField("work_location", e.target.value)} /></label>
          <label className="text-xs text-slate-600">Employment Type
            <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.employment_type || ""} onChange={(e) => setField("employment_type", e.target.value)}>
              <option value="">Select</option><option>Full Time</option><option>Part Time</option><option>Contract</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">Joining Date<input type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.joining_date || ""} onChange={(e) => setField("joining_date", e.target.value)} /></label>
          <label className="text-xs text-slate-600">Work Mode
            <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.work_mode || ""} onChange={(e) => setField("work_mode", e.target.value)}>
              <option value="">Select</option><option>Hybrid</option><option>Work from home</option><option>Work from office</option>
            </select>
          </label>
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
                multiple
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                onChange={(e) => setFiles((prev) => ({ ...prev, [d.key]: Array.from(e.target.files || []) }))}
              />
              {(files[d.key] || []).length > 0 ? (
                <div className="mt-1 text-xs text-slate-500">{(files[d.key] || []).map((f) => f.name).join(", ")}</div>
              ) : null}
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">Bank Details</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">Bank Name<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.bank_name || ""} onChange={(e) => setField("bank_name", e.target.value)} /></label>
          <label className="text-xs text-slate-600">Account Holder Name<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.bank_account_holder || ""} onChange={(e) => setField("bank_account_holder", e.target.value)} /></label>
          <label className="text-xs text-slate-600">Account Number<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.bank_account_number || ""} onChange={(e) => setField("bank_account_number", e.target.value)} /></label>
          <label className="text-xs text-slate-600">IFSC Code<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.bank_ifsc || ""} onChange={(e) => setField("bank_ifsc", e.target.value)} /></label>
          <label className="text-xs text-slate-600">Branch Name<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.bank_branch || ""} onChange={(e) => setField("bank_branch", e.target.value)} /></label>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">Education Details</div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[920px] w-full border-collapse border border-slate-300 text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-2 text-left">Education</th>
                <th className="border border-slate-300 p-2 text-left">College/University (with Location)</th>
                <th className="border border-slate-300 p-2 text-left">From (MM/YY)</th>
                <th className="border border-slate-300 p-2 text-left">To (MM/YY)</th>
                <th className="border border-slate-300 p-2 text-left">Specialization</th>
                <th className="border border-slate-300 p-2 text-left">Percentage</th>
              </tr>
            </thead>
            <tbody>
              {educationRows.map((row, idx) => (
                <tr key={`${row.education}-${idx}`}>
                  <td className="border border-slate-300 p-2">{row.education}</td>
                  <td className="border border-slate-300 p-1"><input className="w-full rounded border border-slate-200 px-2 py-1" value={row.institute} onChange={(e) => setEducationRows((prev) => prev.map((r, i) => i === idx ? { ...r, institute: e.target.value } : r))} /></td>
                  <td className="border border-slate-300 p-1"><input className="w-full rounded border border-slate-200 px-2 py-1" value={row.from} onChange={(e) => setEducationRows((prev) => prev.map((r, i) => i === idx ? { ...r, from: e.target.value } : r))} /></td>
                  <td className="border border-slate-300 p-1"><input className="w-full rounded border border-slate-200 px-2 py-1" value={row.to} onChange={(e) => setEducationRows((prev) => prev.map((r, i) => i === idx ? { ...r, to: e.target.value } : r))} /></td>
                  <td className="border border-slate-300 p-1"><input className="w-full rounded border border-slate-200 px-2 py-1" value={row.specialization} onChange={(e) => setEducationRows((prev) => prev.map((r, i) => i === idx ? { ...r, specialization: e.target.value } : r))} /></td>
                  <td className="border border-slate-300 p-1"><input className="w-full rounded border border-slate-200 px-2 py-1" value={row.percentage} onChange={(e) => setEducationRows((prev) => prev.map((r, i) => i === idx ? { ...r, percentage: e.target.value } : r))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-800">Previous Employment / Jobs</div>
          <button type="button" onClick={() => setEmploymentRows((prev) => [...prev, emptyEmploymentRow()])} className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">+ Add row</button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[1020px] w-full border-collapse border border-slate-300 text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-2 text-left">S.No</th>
                <th className="border border-slate-300 p-2 text-left">Name and address of Employer</th>
                <th className="border border-slate-300 p-2 text-left">Emp Id</th>
                <th className="border border-slate-300 p-2 text-left">From (DD/MM/YYYY)</th>
                <th className="border border-slate-300 p-2 text-left">To (DD/MM/YYYY)</th>
                <th className="border border-slate-300 p-2 text-left">Designation</th>
                <th className="border border-slate-300 p-2 text-left">Last Salary Drawn</th>
                <th className="border border-slate-300 p-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {employmentRows.map((row, idx) => (
                <tr key={`emp-${idx}`}>
                  <td className="border border-slate-300 p-2">{idx + 1}</td>
                  <td className="border border-slate-300 p-1"><input className="w-full rounded border border-slate-200 px-2 py-1" value={row.employer} onChange={(e) => setEmploymentRows((prev) => prev.map((r, i) => i === idx ? { ...r, employer: e.target.value } : r))} /></td>
                  <td className="border border-slate-300 p-1"><input className="w-full rounded border border-slate-200 px-2 py-1" value={row.empId} onChange={(e) => setEmploymentRows((prev) => prev.map((r, i) => i === idx ? { ...r, empId: e.target.value } : r))} /></td>
                  <td className="border border-slate-300 p-1"><input type="date" className="w-full rounded border border-slate-200 px-2 py-1" value={row.from} onChange={(e) => setEmploymentRows((prev) => prev.map((r, i) => i === idx ? { ...r, from: e.target.value } : r))} /></td>
                  <td className="border border-slate-300 p-1"><input type="date" className="w-full rounded border border-slate-200 px-2 py-1" value={row.to} onChange={(e) => setEmploymentRows((prev) => prev.map((r, i) => i === idx ? { ...r, to: e.target.value } : r))} /></td>
                  <td className="border border-slate-300 p-1"><input className="w-full rounded border border-slate-200 px-2 py-1" value={row.designation} onChange={(e) => setEmploymentRows((prev) => prev.map((r, i) => i === idx ? { ...r, designation: e.target.value } : r))} /></td>
                  <td className="border border-slate-300 p-1"><input className="w-full rounded border border-slate-200 px-2 py-1" value={row.salary} onChange={(e) => setEmploymentRows((prev) => prev.map((r, i) => i === idx ? { ...r, salary: e.target.value } : r))} /></td>
                  <td className="border border-slate-300 p-1">
                    <button type="button" className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 disabled:opacity-40" disabled={employmentRows.length <= 1} onClick={() => setEmploymentRows((prev) => prev.filter((_, i) => i !== idx))}>- Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">Professional References</div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[820px] w-full border-collapse border border-slate-300 text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-2 text-left">Field</th>
                <th className="border border-slate-300 p-2 text-left">Reference No 1</th>
                <th className="border border-slate-300 p-2 text-left">Reference No 2</th>
                <th className="border border-slate-300 p-2 text-left">Reference No 3</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-2">Name / Designation</td>
                {references.map((ref, idx) => (
                  <td key={`r-name-${idx}`} className="border border-slate-300 p-1"><input className="w-full rounded border border-slate-200 px-2 py-1" value={ref.nameDesignation} onChange={(e) => setReferences((prev) => prev.map((r, i) => i === idx ? { ...r, nameDesignation: e.target.value } : r))} /></td>
                ))}
              </tr>
              <tr>
                <td className="border border-slate-300 p-2">Email id and Mob. No.</td>
                {references.map((ref, idx) => (
                  <td key={`r-contact-${idx}`} className="border border-slate-300 p-1"><input className="w-full rounded border border-slate-200 px-2 py-1" value={ref.emailPhone} onChange={(e) => setReferences((prev) => prev.map((r, i) => i === idx ? { ...r, emailPhone: e.target.value } : r))} /></td>
                ))}
              </tr>
              <tr>
                <td className="border border-slate-300 p-2">Nature of Association</td>
                {references.map((ref, idx) => (
                  <td key={`r-assoc-${idx}`} className="border border-slate-300 p-1"><input className="w-full rounded border border-slate-200 px-2 py-1" value={ref.association} onChange={(e) => setReferences((prev) => prev.map((r, i) => i === idx ? { ...r, association: e.target.value } : r))} /></td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-slate-800">HR Declaration</div>
        <div className="mt-2 text-xs text-slate-600">I confirm that the information provided above is true and correct to the best of my knowledge.</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">Employee Signature (typed name)<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.declaration_name || ""} onChange={(e) => setField("declaration_name", e.target.value)} /></label>
          <label className="text-xs text-slate-600">Date<input type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.declaration_date || todayIso()} onChange={(e) => setField("declaration_date", e.target.value)} /></label>
        </div>
      </div>

      <button type="button" onClick={() => void submit()} disabled={submitting} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
        {submitting ? "Submitting..." : "Submit onboarding form"}
      </button>
    </div>
  );
}

