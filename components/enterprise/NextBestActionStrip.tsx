"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

type ActionItem = { label: string; href: string };

export default function NextBestActionStrip({
  title = "Next best actions",
  actions,
}: {
  title?: string;
  actions: ActionItem[];
}) {
  if (!actions.length) return null;
  return (
    <div className="rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-3 py-2 shadow-[var(--ats-shadow-sm)]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">{title}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {actions.map((action) => (
          <Link
            key={`${action.label}-${action.href}`}
            href={action.href}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ats-text)] transition hover:bg-[var(--ats-bg-panel-strong)]"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
