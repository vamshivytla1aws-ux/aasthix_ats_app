"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import { UI } from "@/lib/ui";
import { apiFetchJson } from "@/lib/apiClient";

function formatClientDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(t));
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className={UI.enterprise.metricCard}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">{label}</div>
      <div className="mt-2 text-xl font-semibold tracking-tight text-[var(--ats-text)]">{value}</div>
    </div>
  );
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = Number(params?.id);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetchJson<any>(`/api/clients/${clientId}`);
      setData(res);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (Number.isFinite(clientId)) void load();
  }, [clientId, load]);

  const contacts = useMemo(() => data?.client?.contacts || [], [data?.client?.contacts]);

  if (!Number.isFinite(clientId)) {
    return (
      <ModulePageFrame title="Client" subtitle="Invalid client id">
        <div className={`${UI.enterprise.elevatedCard} p-6 text-sm text-[var(--ats-text-muted)]`}>Invalid client id.</div>
      </ModulePageFrame>
    );
  }

  if (loading) {
    return (
      <ModulePageFrame title="Client" subtitle="Loading account intelligence">
        <div className={`${UI.enterprise.elevatedCard} p-6`}>
          <div className="h-8 w-56 animate-pulse rounded bg-[var(--ats-border-subtle)]" />
          <div className="mt-4 h-44 animate-pulse rounded-2xl bg-[var(--ats-border-subtle)]" />
        </div>
      </ModulePageFrame>
    );
  }

  if (!data?.client) {
    return (
      <ModulePageFrame title="Client" subtitle="Client not found">
        <div className={`${UI.enterprise.elevatedCard} p-6`}>
          <Link href="/clients" className="text-sm font-semibold text-[var(--ats-primary)] hover:underline">
            Back to clients
          </Link>
        </div>
      </ModulePageFrame>
    );
  }

  const c = data.client;

  return (
    <ModulePageFrame
      title={c.name}
      subtitle={[c.industry || "Industry not set", c.service_type || "Service type not set"].join(" · ")}
      metrics={
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-3 py-1 text-xs font-semibold text-[var(--ats-text)]">
            {c.status || "Active"}
          </span>
          <span className="rounded-full border border-[color:rgb(37_99_235_/_0.18)] bg-[color:rgb(37_99_235_/_0.1)] px-3 py-1 text-xs font-semibold text-[var(--ats-primary)]">
            {contacts.length} contact{contacts.length === 1 ? "" : "s"}
          </span>
        </div>
      }
      actions={
        <Link href="/clients" className={UI.secondaryButton + " py-2 text-sm"}>
          Back to clients
        </Link>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-4">
          <MetricTile label="Website" value={c.website ? "Available" : "Not set"} />
          <MetricTile label="Invoice days" value={c.invoice_days || "—"} />
          <MetricTile label="Agreement" value={c.agreement_enabled ? "Enabled" : "Disabled"} />
          <MetricTile label="Renewal notice" value={`${c.renewal_notice_days ?? 30} days`} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <section className={`${UI.enterprise.elevatedCard} p-6`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">
              Account profile
            </div>
            <dl className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">Website</dt>
                <dd className="mt-1 text-sm text-[var(--ats-text)]">
                  {c.website ? (
                    <a className="font-medium text-[var(--ats-primary)] hover:underline" href={c.website} target="_blank" rel="noreferrer">
                      {c.website}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">Commercials</dt>
                <dd className="mt-1 text-sm text-[var(--ats-text)]">{c.commercials || "—"}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">Address</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-[var(--ats-text)]">{c.address || "—"}</dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">Additional notes</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-[var(--ats-text)]">{c.remarks || "—"}</dd>
              </div>
            </dl>
          </section>

          <section className={`${UI.enterprise.elevatedCard} p-6`}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">
              Agreement window
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-[var(--ats-border-subtle)] bg-[var(--ats-bg-panel)] px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">Start</div>
                <div className="mt-1 text-sm font-semibold text-[var(--ats-text)]">{formatClientDate(c.agreement_start_date)}</div>
              </div>
              <div className="rounded-2xl border border-[var(--ats-border-subtle)] bg-[var(--ats-bg-panel)] px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">End</div>
                <div className="mt-1 text-sm font-semibold text-[var(--ats-text)]">{formatClientDate(c.agreement_end_date)}</div>
              </div>
            </div>
          </section>
        </div>

        <section className={`${UI.enterprise.elevatedCard} p-6`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">SPOC contacts</div>
              <div className="mt-1 text-sm text-[var(--ats-text-muted)]">Primary client-side relationships and delivery contacts.</div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {contacts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-6 text-sm text-[var(--ats-text-muted)]">
                No contacts added yet.
              </div>
            ) : (
              contacts.map((sp: any) => (
                <div key={sp.id || sp.email || sp.name} className="rounded-2xl border border-[var(--ats-border-subtle)] bg-[var(--ats-bg-panel)] p-4">
                  <div className="text-base font-semibold text-[var(--ats-text)]">{sp.name}</div>
                  <div className="mt-1 text-sm text-[var(--ats-text-muted)]">
                    {sp.email || "—"}
                    {sp.phone ? ` · ${sp.phone}` : ""}
                  </div>
                  {sp.designation ? (
                    <div className="mt-2 inline-flex rounded-full border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ats-text-muted)]">
                      {sp.designation}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </ModulePageFrame>
  );
}
