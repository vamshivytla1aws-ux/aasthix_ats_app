"use client";

import React from "react";
import StatusBadge from "@/components/enterprise/StatusBadge";

function formatAgreementEnd(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(t));
}

function expiryStatus(row: { agreement_days_left?: number | null }): string {
  const days = row?.agreement_days_left;
  if (typeof days !== "number" || !Number.isFinite(days)) return "Unknown";
  if (days < 7) return "Critical";
  if (days < 30) return "Renew soon";
  return "Active";
}

function daysLeftLabel(days: number): string {
  if (days === 0) return "Ends today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

export default function AgreementExpiryCell({ row }: { row: Record<string, unknown> }) {
  const days = row?.agreement_days_left;
  const hasDays = typeof days === "number" && Number.isFinite(days);
  const end = row?.agreement_end_date;
  const dateLine = typeof end === "string" ? formatAgreementEnd(end) : "—";
  const sub = hasDays ? daysLeftLabel(days) : null;

  return (
    <div className="inline-flex max-w-[10rem] flex-col gap-0.5 rounded-2xl border border-violet-100/90 bg-gradient-to-br from-violet-50/90 via-white to-fuchsia-50/40 px-2 py-1.5 shadow-sm dark:border-violet-800/50 dark:from-violet-950/40 dark:via-slate-900/90 dark:to-fuchsia-950/20">
      <div className="origin-left scale-[0.92]">
        <StatusBadge status={expiryStatus(row as { agreement_days_left?: number | null })} />
      </div>
      <div className="text-[11px] font-semibold leading-tight text-violet-950/90 dark:text-violet-100/95">
        {dateLine}
      </div>
      {sub ? (
        <div className="text-[10px] leading-none text-violet-600/70 dark:text-violet-300/75">
          {sub}
        </div>
      ) : null}
    </div>
  );
}
