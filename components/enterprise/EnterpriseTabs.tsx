"use client";

import React from "react";

export type EnterpriseTab = { id: string; label: string };

type EnterpriseTabsProps = {
  tabs: EnterpriseTab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
};

export default function EnterpriseTabs({ tabs, active, onChange, className = "" }: EnterpriseTabsProps) {
  return (
    <div className={["flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700", className].join(" ")}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={[
            "relative -mb-px rounded-t-lg px-3 py-2 text-xs font-semibold transition",
            active === t.id
              ? "border border-b-0 border-slate-200 bg-white text-blue-700 dark:border-slate-600 dark:bg-slate-900 dark:text-blue-400"
              : "border border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-200",
          ].join(" ")}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
