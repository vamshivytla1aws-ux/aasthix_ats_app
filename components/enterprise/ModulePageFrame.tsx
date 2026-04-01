"use client";

import React from "react";

type ModulePageFrameProps = {
  title: string;
  subtitle?: string;
  metrics?: React.ReactNode;
  actions?: React.ReactNode;
  /** Optional full-width strip under the header (errors, permission hints, global empty state). */
  banner?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Standard module layout: title row + optional toolbar + content on light surface.
 */
export default function ModulePageFrame({ title, subtitle, metrics, actions, banner, toolbar, children }: ModulePageFrameProps) {
  return (
    <div className="space-y-4">
      <div
        className={`flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between dark:border-slate-700/80 dark:bg-slate-900/90`}
      >
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p> : null}
          {metrics ? <div className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">{metrics}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {banner ? <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/90">{banner}</div> : null}
      {toolbar ? <div className="space-y-3">{toolbar}</div> : null}
      <div>{children}</div>
    </div>
  );
}
