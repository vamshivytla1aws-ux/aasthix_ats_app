"use client";

import React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useDashboardThemeOptional } from "@/components/DashboardThemeProvider";
import type { DashboardThemeMode } from "@/lib/dashboardTheme";

function Icon({ mode }: { mode: DashboardThemeMode }) {
  if (mode === "auto") return <Monitor className="h-4 w-4" aria-hidden />;
  if (mode === "light") return <Sun className="h-4 w-4" aria-hidden />;
  return <Moon className="h-4 w-4" aria-hidden />;
}

export default function DashboardThemeToggle({ variant = "default" }: { variant?: "default" | "shell" }) {
  const ctx = useDashboardThemeOptional();
  if (!ctx) return null;

  const { mode, cycleTheme, label } = ctx;

  const cls =
    variant === "shell"
      ? "inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/15 p-2 text-white shadow-none transition hover:bg-white/25"
      : "inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white p-2.5 text-slate-700 shadow-ats-sm transition duration-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-800";

  return (
    <button type="button" onClick={cycleTheme} title={label} aria-label={label} className={cls}>
      <Icon mode={mode} />
    </button>
  );
}
