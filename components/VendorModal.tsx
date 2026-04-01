"use client";

import React, { useEffect, useState } from "react";
import { UI } from "@/lib/ui";
import { apiFetchJson } from "@/lib/apiClient";
import Toast from "@/components/Toast";

export type VendorRow = {
  id: number;
  name: string;
  industry?: string | null;
  service_type?: string | null;
  website?: string | null;
  address?: string | null;
  commercials?: string | null;
  invoice_days?: string | null;
  invoice_agreement: boolean;
  status: string;
  remarks?: string | null;
  created_at?: string;
};

export default function VendorModal({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial?: VendorRow | null;
  onClose: () => void;
  onSaved: (vendor: VendorRow) => void;
}) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [commercials, setCommercials] = useState("");
  const [invoiceDays, setInvoiceDays] = useState("");
  const [invoiceAgreement, setInvoiceAgreement] = useState(false);
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");
  const [remarks, setRemarks] = useState("");
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
    setInvoiceAgreement(Boolean(initial?.invoice_agreement ?? false));
    setStatus(((initial?.status as any) ?? "Active") === "Inactive" ? "Inactive" : "Active");
    setRemarks(initial?.remarks ?? "");
  }, [open, initial]);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || name.trim().length === 0) {
      setToast({ message: "Name is required.", variant: "error" });
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
        invoice_agreement: invoiceAgreement,
        status,
        remarks: remarks || null,
      };

      const saved =
        mode === "create"
          ? await apiFetchJson<VendorRow>("/api/vendors", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await apiFetchJson<VendorRow>(`/api/vendors/${initial?.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log("Vendor API response:", saved);
      }
      onSaved(saved);
      setToast({ message: mode === "create" ? "Vendor created." : "Vendor updated.", variant: "success" });
      onClose();
    } catch (err: any) {
      setToast({ message: err.message || "Failed to save vendor", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
      <div className="fixed inset-0 z-40">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-md border border-slate-200 p-6 pb-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-lg font-semibold">{mode === "create" ? "Add Vendor" : "Edit Vendor"}</div>
                <div className="text-sm text-gray-600">Manage client/vendor details.</div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition-all duration-200"
                disabled={submitting}
              >
                Close
              </button>
            </div>

            <form onSubmit={submit} className="mt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className={UI.label}>Name</label>
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
                  <input className={UI.input} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
                </div>
                <div>
                  <label className={UI.label}>Status</label>
                  <select className={UI.select} value={status} onChange={(e) => setStatus(e.target.value as any)}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className={UI.label}>Address</label>
                  <textarea className={[UI.input, "min-h-[80px] resize-y"].join(" ")} value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className={UI.label}>Commercials</label>
                  <textarea className={[UI.input, "min-h-[80px] resize-y"].join(" ")} value={commercials} onChange={(e) => setCommercials(e.target.value)} />
                </div>
                <div>
                  <label className={UI.label}>Invoice Days</label>
                  <select className={UI.select} value={invoiceDays} onChange={(e) => setInvoiceDays(e.target.value)}>
                    <option value="">Select…</option>
                    <option value="30 Days">30 Days</option>
                    <option value="60 Days">60 Days</option>
                    <option value="90 Days">90 Days</option>
                    <option value="30-60 Days">30-60 Days</option>
                  </select>
                </div>
                <div className="md:col-span-2 flex items-center gap-3">
                  <input
                    id="invoice_agreement"
                    type="checkbox"
                    checked={invoiceAgreement}
                    onChange={(e) => setInvoiceAgreement(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="invoice_agreement" className="text-sm text-slate-700">
                    Invoice agreement
                  </label>
                </div>
                <div className="md:col-span-2">
                  <label className={UI.label}>Remarks</label>
                  <textarea className={[UI.input, "min-h-[90px] resize-y"].join(" ")} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                </div>
              </div>

              <div className="pt-2">
                <button type="submit" disabled={submitting} className={["w-full justify-center", UI.primaryButton].join(" ")}>
                  {submitting && (
                    <span
                      className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  {submitting ? "Saving..." : mode === "create" ? "Add Vendor" : "Save Vendor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

