"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  cycleThemeMode,
  DASHBOARD_THEME_STORAGE_KEY,
  DashboardThemeMode,
  parseStoredTheme,
  resolveEffectiveDark,
  themeModeLabel,
} from "@/lib/dashboardTheme";

type Ctx = {
  mode: DashboardThemeMode;
  effectiveDark: boolean;
  cycleTheme: () => void;
  label: string;
};

const DashboardThemeContext = createContext<Ctx | null>(null);

export function useDashboardTheme(): Ctx {
  const c = useContext(DashboardThemeContext);
  if (!c) {
    throw new Error("useDashboardTheme must be used inside DashboardThemeProvider");
  }
  return c;
}

/** Optional: navbar pieces that may render before provider in edge cases */
export function useDashboardThemeOptional(): Ctx | null {
  return useContext(DashboardThemeContext);
}

export function DashboardThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<DashboardThemeMode>("auto");
  const [hydrated, setHydrated] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    try {
      setMode(parseStoredTheme(localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY)));
    } catch {
      setMode("auto");
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode, hydrated]);

  // Re-evaluate Auto mode as local time passes
  useEffect(() => {
    if (mode !== "auto") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, [mode]);

  useEffect(() => {
    const onVis = () => {
      if (mode === "auto") setTick((t) => t + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [mode]);

  const effectiveDark = useMemo(() => {
    void tick;
    return resolveEffectiveDark(mode);
  }, [mode, tick]);

  const cycleTheme = useCallback(() => {
    setMode((m) => cycleThemeMode(m));
  }, []);

  const value = useMemo(
    () => ({
      mode,
      effectiveDark,
      cycleTheme,
      label: themeModeLabel(mode),
    }),
    [mode, effectiveDark, cycleTheme]
  );

  return (
    <DashboardThemeContext.Provider value={value}>
      <div
        className={[
          "dashboard-root flex min-h-screen flex-col overflow-x-hidden bg-[var(--ats-bg-page)] text-slate-900 dark:text-slate-100 transition-colors duration-300",
          effectiveDark ? "dark" : "",
        ].join(" ")}
        suppressHydrationWarning
      >
        {children}
      </div>
    </DashboardThemeContext.Provider>
  );
}
