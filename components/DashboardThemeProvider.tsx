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

export function useDashboardThemeOptional(): Ctx | null {
  return useContext(DashboardThemeContext);
}

export function DashboardThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<DashboardThemeMode>("auto");
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setMode(parseStoredTheme(window.localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY)));
    } catch {
      setMode("auto");
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyMedia = () => setSystemPrefersDark(media.matches);
    applyMedia();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", applyMedia);
      return () => media.removeEventListener("change", applyMedia);
    }

    media.addListener(applyMedia);
    return () => media.removeListener(applyMedia);
  }, []);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode, hydrated]);

  const effectiveDark = useMemo(
    () => resolveEffectiveDark(mode, systemPrefersDark),
    [mode, systemPrefersDark]
  );

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.classList.toggle("dark", effectiveDark);
    root.dataset.theme = effectiveDark ? "dark" : "light";
    body.dataset.theme = effectiveDark ? "dark" : "light";
  }, [effectiveDark]);

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
        className="dashboard-root flex min-h-screen flex-col overflow-x-hidden bg-[var(--ats-bg-page)] text-[var(--ats-text)] transition-colors duration-300"
        suppressHydrationWarning
      >
        {children}
      </div>
    </DashboardThemeContext.Provider>
  );
}
