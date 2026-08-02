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
    <div className="ats-page-enter space-y-5">
      <section className="border-b border-[var(--ats-border)] pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ats-primary)]">
              Workspace
            </div>
            <h1 className="mt-1.5 font-display text-2xl font-semibold text-[var(--ats-text)] sm:text-[1.9rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ats-text-muted)] sm:text-[15px]">
                {subtitle}
              </p>
            ) : null}
            {metrics ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--ats-text)]">
                {metrics}
              </div>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {(banner || toolbar) ? (
          <div className="mt-4 border-t border-[var(--ats-border-subtle)] pt-4">
            {banner ? (
              <div className="rounded-[var(--ats-radius-md)] border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-4 py-3">
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
