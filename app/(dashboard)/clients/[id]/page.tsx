"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetchJson } from "@/lib/apiClient";

function formatClientDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(t));
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params?.id);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetchJson<any>(`/api/clients/${clientId}`);
      setData(res);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (Number.isFinite(clientId)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  if (!Number.isFinite(clientId)) return <div className="p-6">Invalid client id.</div>;
  if (loading) return <div className="p-6">Loading client...</div>;
  if (!data?.client) return <div className="p-6">Client not found.</div>;

  const c = data.client;
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div className="text-sm">
        <Link href="/clients" className="text-blue-700 hover:underline">← Back to Clients</Link>
      </div>
      <div className="rounded-2xl border bg-white p-5">
        <div className="text-2xl font-bold">{c.name}</div>
        <div className="mt-2 text-sm text-slate-600">{c.industry || "—"} • {c.service_type || "—"}</div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-700">
          <div>Website: {c.website ? <a className="text-blue-700 underline" href={c.website} target="_blank" rel="noreferrer">{c.website}</a> : "—"}</div>
          <div>Status: <span className="font-semibold">{c.status || "Active"}</span></div>
          <div>Commercials: {c.commercials || "—"}</div>
          <div>Invoice Days: {c.invoice_days || "—"}</div>
        </div>
        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</div>
          <div className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{c.address || "—"}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-white p-5">
          <div className="text-sm font-semibold text-slate-900">SPOC Contacts</div>
          <div className="mt-3 space-y-2">
            {(c.contacts || []).length === 0 ? <div className="text-sm text-slate-500">No contacts</div> : null}
            {(c.contacts || []).map((sp: any) => (
              <div key={sp.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <div className="font-semibold">{sp.name}</div>
                <div className="text-slate-600">{sp.email || "—"} {sp.phone ? `• ${sp.phone}` : ""}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-violet-100/90 bg-gradient-to-br from-violet-50/80 via-white to-fuchsia-50/30 p-4 shadow-sm dark:border-violet-900/40 dark:from-violet-950/30 dark:via-slate-900 dark:to-fuchsia-950/20">
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-600/80 dark:text-violet-300/90">
            Agreement
          </div>
          <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">
            Available: <span className="font-semibold">{c.agreement_enabled ? "Yes" : "No"}</span>
          </div>
          <div className="mt-2 space-y-1 text-[13px] leading-snug text-slate-700 dark:text-slate-200">
            <div>
              <span className="text-slate-500 dark:text-slate-400">Start</span>{" "}
              <span className="font-medium">{formatClientDate(c.agreement_start_date)}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">End</span>{" "}
              <span className="font-medium">{formatClientDate(c.agreement_end_date)}</span>
            </div>
            <div>
              <span className="text-slate-500 dark:text-slate-400">Renewal notice</span>{" "}
              <span className="font-medium">{c.renewal_notice_days ?? 30} days</span>
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border bg-white p-5">
        <div className="text-sm font-semibold text-slate-900">Additional Notes</div>
        <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{c.remarks || "—"}</div>
      </div>
    </div>
  );
}

