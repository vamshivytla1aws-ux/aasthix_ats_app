export type DashboardThemeMode = "auto" | "light" | "dark";

export const DASHBOARD_THEME_STORAGE_KEY = "ats-dashboard-theme";

export function resolveEffectiveDark(mode: DashboardThemeMode, systemPrefersDark = false): boolean {
  if (mode === "light") return false;
  if (mode === "dark") return true;
  return systemPrefersDark;
}

export function parseStoredTheme(raw: string | null): DashboardThemeMode {
  if (raw === "light" || raw === "dark" || raw === "auto") return raw;
  return "auto";
}

export function cycleThemeMode(current: DashboardThemeMode): DashboardThemeMode {
  if (current === "auto") return "light";
  if (current === "light") return "dark";
  return "auto";
}

export function themeModeLabel(mode: DashboardThemeMode): string {
  if (mode === "auto") return "Theme: Auto (system)";
  if (mode === "light") return "Theme: Light";
  return "Theme: Dark";
}
