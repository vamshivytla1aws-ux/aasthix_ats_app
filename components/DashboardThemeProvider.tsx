"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DASHBOARD_THEME_STORAGE_KEY,
  DashboardThemeMode,
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

export function useDashboardThemeOptional(): Ctx | null {
  return useContext(DashboardThemeContext);
}

export function DashboardThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode] = useState<DashboardThemeMode>("light");
  const effectiveDark = useMemo(() => false, []);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.remove("dark");
    root.dataset.theme = "light";
    body.dataset.theme = "light";
    try {
      window.localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, "light");
    } catch {
      // ignore
    }
  }, [effectiveDark]);

  const cycleTheme = useCallback(() => {}, []);

  const value = useMemo(
    () => ({
      mode,
      effectiveDark,
      cycleTheme,
      label: "Light mode",
    }),
    [mode, effectiveDark, cycleTheme]
  );

  return (
    <DashboardThemeContext.Provider value={value}>
      <div
        className="dashboard-root flex min-h-screen flex-col overflow-x-hidden bg-[var(--ats-bg-page)] text-[var(--ats-text)] transition-colors duration-300"
        suppressHydrationWarning
      >
        {children}
      </div>
    </DashboardThemeContext.Provider>
  );
}
