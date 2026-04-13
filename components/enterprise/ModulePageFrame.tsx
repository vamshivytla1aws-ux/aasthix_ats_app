"use client";

import React from "react";

type ModulePageFrameProps = {
  title: string;
  subtitle?: string;
  metrics?: React.ReactNode;
  actions?: React.ReactNode;
  banner?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
};

export default function ModulePageFrame({
  title,
  subtitle,
  metrics,
  actions,
  banner,
  toolbar,
  children,
}: ModulePageFrameProps) {
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[1.65rem] border border-[var(--ats-border)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--ats-primary)_14%,var(--ats-bg-elevated)),var(--ats-bg-elevated)_38%,color-mix(in_oklab,var(--ats-accent)_10%,var(--ats-bg-elevated)))] shadow-[var(--ats-shadow-md)] ring-1 ring-[rgb(255_255_255_/_0.42)]">
        <div className="flex flex-col gap-4 px-5 py-5 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center rounded-full border border-[color:rgb(37_99_235_/_0.16)] bg-[color:rgb(255_255_255_/_0.56)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-primary)]">
              Enterprise workspace
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--ats-text)] sm:text-[1.95rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ats-text-muted)] sm:text-[15px]">
                {subtitle}
              </p>
            ) : null}
            {metrics ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--ats-text)]">
                {metrics}
              </div>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {(banner || toolbar) ? (
          <div className="border-t border-[var(--ats-border)]/70 bg-[color:rgb(255_255_255_/_0.45)] px-5 py-4 backdrop-blur-sm sm:px-6">
            {banner ? (
              <div className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-4 py-3 shadow-[var(--ats-shadow-sm)]">
                {banner}
              </div>
            ) : null}
            {toolbar ? <div className={banner ? "mt-3" : ""}>{toolbar}</div> : null}
          </div>
        ) : null}
      </section>
      <div>{children}</div>
    </div>
  );
}
