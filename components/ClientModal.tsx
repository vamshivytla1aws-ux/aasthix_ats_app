"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { UI } from "@/lib/ui";
import { apiFetchJson } from "@/lib/apiClient";
import Toast from "@/components/Toast";
import { DatePicker } from "@/components/ui/DateTimeFields";

export type ClientContact = {
  id?: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  designation?: string | null;
};

export type ClientRow = {
  id: number;
  name: string;
  industry?: string | null;
  service_type?: string | null;
  website?: string | null;
  address?: string | null;
  commercials?: string | null;
  invoice_days?: string | null;
  invoice_agreement: boolean;
  agreement_enabled?: boolean;
  status: string;
  remarks?: string | null;
  agreement_start_date?: string | null;
  agreement_end_date?: string | null;
  renewal_notice_days?: number | null;
  contacts?: ClientContact[];
  created_at?: string;
};

export default function ClientModal({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial?: ClientRow | null;
  onClose: () => void;
  onSaved: (client: ClientRow) => void;
}) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [commercials, setCommercials] = useState("");
  const [invoiceDays, setInvoiceDays] = useState("");
  const [agreementEnabled, setAgreementEnabled] = useState(false);
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");
  const [remarks, setRemarks] = useState("");
  const [agreementStartDate, setAgreementStartDate] = useState("");
  const [agreementEndDate, setAgreementEndDate] = useState("");
  const [renewalNoticeDays, setRenewalNoticeDays] = useState("30");
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!open) return;
    setToast(null);
    setName(initial?.name ?? "");
    setIndustry(initial?.industry ?? "");
    setServiceType(initial?.service_type ?? "");
    setWebsite(initial?.website ?? "");
    setAddress(initial?.address ?? "");
    setCommercials(initial?.commercials ?? "");
    setInvoiceDays(initial?.invoice_days ?? "");
    setAgreementEnabled(Boolean(initial?.agreement_enabled ?? initial?.invoice_agreement ?? false));
    setStatus(((initial?.status as any) ?? "Active") === "Inactive" ? "Inactive" : "Active");
    setRemarks(initial?.remarks ?? "");
    setAgreementStartDate(initial?.agreement_start_date ? String(initial.agreement_start_date).slice(0, 10) : "");
    setAgreementEndDate(initial?.agreement_end_date ? String(initial.agreement_end_date).slice(0, 10) : "");
    setRenewalNoticeDays(String(initial?.renewal_notice_days ?? 30));
    setContacts(Array.isArray(initial?.contacts) ? initial!.contacts! : []);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || name.trim().length === 0) {
      setToast({ message: "Client name is required.", variant: "error" });
      return;
    }
    if (invoiceDays && !/^\d+$/.test(invoiceDays)) {
      setToast({ message: "Invoice days must be a number.", variant: "error" });
      return;
    }
    if (agreementEnabled && (!agreementStartDate || !agreementEndDate)) {
      setToast({ message: "Agreement start and end dates are required.", variant: "error" });
      return;
    }
    const invalidContact = contacts.find((c) => c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email));
    if (invalidContact) {
      setToast({ message: "Please enter valid SPOC email addresses.", variant: "error" });
      return;
    }
    setSubmitting(true);
    setToast(null);
    try {
      const payload = {
        name: name.trim(),
        industry: industry || null,
        service_type: serviceType || null,
        website: website || null,
        address: address || null,
        commercials: commercials || null,
        invoice_days: invoiceDays || null,
        invoice_agreement: agreementEnabled,
        agreement_enabled: agreementEnabled,
        status,
        remarks: remarks || null,
        agreement_start_date: agreementEnabled ? agreementStartDate || null : null,
        agreement_end_date: agreementEnabled ? agreementEndDate || null : null,
        renewal_notice_days: agreementEnabled && Number.isFinite(Number(renewalNoticeDays)) ? Number(renewalNoticeDays) : 30,
        contacts: contacts.filter((c) => String(c.name || "").trim().length > 0),
      };
      const saved =
        mode === "create"
          ? await apiFetchJson<ClientRow>("/api/clients", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await apiFetchJson<ClientRow>(`/api/clients/${initial?.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      onSaved(saved);
      onClose();
    } catch (err: any) {
      setToast({ message: err.message || "Failed to save client", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
        <button
          type="button"
          aria-label="Close dialog"
          className="absolute inset-0 bg-black/40"
          onClick={() => !submitting && onClose()}
        />
        <div
          className="relative flex min-h-0 w-full max-w-4xl max-h-[min(92vh,calc(100dvh-1rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
            <div className="text-lg font-semibold text-slate-900">{mode === "create" ? "Add Client" : "Edit Client"}</div>
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-5">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-900">Basic Info</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className={UI.label}>Client Name</label>
                  <input className={UI.input} value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div>
                  <label className={UI.label}>Industry</label>
                  <input className={UI.input} value={industry} onChange={(e) => setIndustry(e.target.value)} />
                </div>
                <div>
                  <label className={UI.label}>Service Type</label>
                  <input className={UI.input} value={serviceType} onChange={(e) => setServiceType(e.target.value)} />
                </div>
                <div>
                  <label className={UI.label}>Website</label>
                  <input className={UI.input} value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className={UI.label}>Address</label>
                  <textarea className={[UI.input, "min-h-[90px] resize-y"].join(" ")} value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-900">Business Details</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={UI.label}>Commercials</label>
                    <input className={UI.input} value={commercials} onChange={(e) => setCommercials(e.target.value)} placeholder='e.g. "8.33%" or "Flat 50000"' />
                  </div>
                  <div>
                    <label className={UI.label}>Invoice Days</label>
                    <input inputMode="numeric" className={UI.input} value={invoiceDays} onChange={(e) => setInvoiceDays(e.target.value.replace(/[^\d]/g, ""))} placeholder="30" />
                  </div>
                  <div className="md:col-span-2">
                    <label className={UI.label}>Status</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setStatus("Active")} className={["rounded-full px-3 py-1.5 text-xs font-semibold", status === "Active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"].join(" ")}>Active</button>
                      <button type="button" onClick={() => setStatus("Inactive")} className={["rounded-full px-3 py-1.5 text-xs font-semibold", status === "Inactive" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700"].join(" ")}>Inactive</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-900">Agreement</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={UI.label}>Agreement Available?</label>
                    <select className={UI.select} value={agreementEnabled ? "yes" : "no"} onChange={(e) => setAgreementEnabled(e.target.value === "yes")}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </div>
                  {agreementEnabled ? (
                    <>
                      <div>
                        <label className={UI.label}>Agreement Start Date</label>
                        <DatePicker value={agreementStartDate} onChange={setAgreementStartDate} aria-label="Agreement start date" />
                      </div>
                      <div>
                        <label className={UI.label}>Agreement End Date</label>
                        <DatePicker value={agreementEndDate} onChange={setAgreementEndDate} min={agreementStartDate} aria-label="Agreement end date" />
                      </div>
                      <div>
                        <label className={UI.label}>Renewal Notice Days</label>
                        <input inputMode="numeric" className={UI.input} value={renewalNoticeDays} onChange={(e) => setRenewalNoticeDays(e.target.value.replace(/[^\d]/g, ""))} />
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="mb-2 text-sm font-semibold text-slate-900">Point of Contacts (SPOC)</div>
                <div className="space-y-2">
                  {contacts.map((c, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <input className={UI.input} placeholder="Name" value={c.name || ""} onChange={(e) => setContacts((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))} />
                      <input className={UI.input} placeholder="Email" value={c.email || ""} onChange={(e) => setContacts((prev) => prev.map((x, i) => (i === idx ? { ...x, email: e.target.value } : x)))} />
                      <input className={UI.input} placeholder="Phone" value={c.phone || ""} onChange={(e) => setContacts((prev) => prev.map((x, i) => (i === idx ? { ...x, phone: e.target.value } : x)))} />
                      <button type="button" className="rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700" onClick={() => setContacts((prev) => prev.filter((_, i) => i !== idx))}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setContacts((prev) => [...prev, { name: "", email: "", phone: "", designation: "" }])}
                  className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                >
                  Add Contact
                </button>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <label className={UI.label}>Additional Notes</label>
                <textarea
                  className={[UI.input, "min-h-[100px] resize-y"].join(" ")}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Internal notes about this client…"
                />
              </div>

            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
              <button
                type="button"
                onClick={() => !submitting && onClose()}
                disabled={submitting}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button type="submit" disabled={submitting} className={UI.primaryButton}>
                {submitting ? "Saving..." : mode === "create" ? "Add Client" : "Save Client"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

