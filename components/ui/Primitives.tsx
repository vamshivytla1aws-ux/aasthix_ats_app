"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Inbox, LoaderCircle } from "lucide-react";
import type { BreadcrumbItem, PageAction, StatusTone } from "@/lib/uiTypes";
import { UI } from "@/lib/ui";

export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs = [],
  actions = [],
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: PageAction[];
}) {
  return (
    <header className="ats-page-enter mb-6 flex flex-col gap-4 border-b border-[var(--ats-border)] pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {breadcrumbs.length ? (
          <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-[var(--ats-text-soft)]">
            {breadcrumbs.map((item, index) => (
              <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
                {index ? <span aria-hidden>/</span> : null}
                {item.href ? <Link href={item.href} className="hover:text-[var(--ats-primary)]">{item.label}</Link> : <span>{item.label}</span>}
              </span>
            ))}
          </nav>
        ) : null}
        {eyebrow ? <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ats-primary)]">{eyebrow}</div> : null}
        <h1 className="font-display text-2xl font-semibold text-[var(--ats-text)] sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[var(--ats-text-muted)]">{description}</p> : null}
      </div>
      {actions.length ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions.map((action) => {
            const classes = action.primary ? UI.primaryButton : UI.secondaryButton;
            if (action.href) return <Link key={action.label} href={action.href} className={classes}>{action.icon}{action.label}</Link>;
            return <button key={action.label} type="button" onClick={action.onClick} className={classes}>{action.icon}{action.label}</button>;
          })}
        </div>
      ) : null}
    </header>
  );
}

const toneClasses: Record<StatusTone, string> = {
  neutral: "border-[var(--ats-border)] bg-[var(--ats-bg-panel)] text-[var(--ats-text-muted)]",
  info: "border-blue-200 bg-blue-50 text-blue-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
};

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}>{children}</span>;
}

export function InlineAlert({ title, children, tone = "info" }: { title: string; children?: ReactNode; tone?: StatusTone }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div className={`flex gap-3 rounded-[var(--ats-radius-md)] border p-3.5 ${toneClasses[tone]}`} role={tone === "danger" ? "alert" : "status"}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div><div className="text-sm font-semibold">{title}</div>{children ? <div className="mt-0.5 text-sm opacity-85">{children}</div> : null}</div>
    </div>
  );
}

export function LoadingState({ label = "Loading workspace" }: { label?: string }) {
  return <div className="grid min-h-48 place-items-center rounded-[var(--ats-radius-lg)] border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)]"><div className="flex items-center gap-2 text-sm text-[var(--ats-text-muted)]"><LoaderCircle className="h-4 w-4 animate-spin text-[var(--ats-primary)]" />{label}</div></div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="grid min-h-56 place-items-center rounded-[var(--ats-radius-lg)] border border-dashed border-[var(--ats-border-strong)] bg-[var(--ats-bg-panel)] p-8 text-center">
      <div className="max-w-md"><span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[var(--ats-bg-panel-strong)] text-[var(--ats-primary)]"><Inbox className="h-5 w-5" /></span><h3 className="mt-3 text-base font-semibold text-[var(--ats-text)]">{title}</h3>{description ? <p className="mt-1 text-sm text-[var(--ats-text-muted)]">{description}</p> : null}{action ? <div className="mt-4">{action}</div> : null}</div>
    </div>
  );
}

export function MetricTile({ label, value, detail, trend }: { label: string; value: ReactNode; detail?: string; trend?: ReactNode }) {
  return <article className="rounded-[var(--ats-radius-lg)] border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-5 shadow-[var(--ats-shadow-sm)]"><div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--ats-text-soft)]">{label}</div><div className="mt-2 flex items-end justify-between gap-3"><div className="font-display text-3xl font-semibold tabular-nums text-[var(--ats-text)]">{value}</div>{trend}</div>{detail ? <p className="mt-1.5 text-xs text-[var(--ats-text-muted)]">{detail}</p> : null}</article>;
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ats-primary)] hover:text-[var(--ats-primary-hover)]">{children}<ArrowRight className="h-3.5 w-3.5" /></Link>;
}
