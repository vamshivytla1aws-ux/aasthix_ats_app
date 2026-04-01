"use client";

import React, { useState } from "react";
import { UI } from "@/lib/ui";
import { apiFetchJson } from "@/lib/apiClient";
import Toast from "@/components/Toast";

type Vendor = {
  id: number;
  name: string;
  website_url?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  created_at?: string;
};

export default function VendorForm({
  onCreated,
}: {
  onCreated: (vendor: Vendor) => void;
}) {
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setToast(null);
    try {
      const created = await apiFetchJson<Vendor>("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          website_url: websiteUrl || null,
          email: email || null,
          phone: phone || null,
          notes: notes || null,
        }),
      });
      onCreated(created);
      setName("");
      setWebsiteUrl("");
      setEmail("");
      setPhone("");
      setNotes("");
      setToast({ message: "Vendor added successfully.", variant: "success" });
    } catch (err: any) {
      setToast({ message: err.message || "Failed to add vendor", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative">
      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
      <form
        onSubmit={submit}
        className="space-y-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-all duration-200 hover:shadow-md hover:scale-[1.01]"
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-lg font-semibold">Add Vendor</h2>
            <div className="text-sm text-gray-600">Track agencies / partners and their jobs.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className={UI.label}>Vendor name</label>
            <input className={UI.input} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className={UI.label}>Website</label>
            <input
              className={UI.input}
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className={UI.label}>Email</label>
            <input
              type="email"
              className={UI.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vendor@example.com"
            />
          </div>
          <div>
            <label className={UI.label}>Phone</label>
            <input className={UI.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91..." />
          </div>
          <div className="md:col-span-2">
            <label className={UI.label}>Notes</label>
            <textarea
              className={[UI.input, "min-h-[110px] resize-y"].join(" ")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contacts, terms, etc."
            />
          </div>
        </div>

        <div className="pt-1">
          <button type="submit" disabled={submitting} className={UI.primaryButton}>
            {submitting && (
              <span
                className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"
                aria-hidden="true"
              />
            )}
            {submitting ? "Saving..." : "Add Vendor"}
          </button>
        </div>
      </form>
    </div>
  );
}

