export type DashboardThemeMode = "auto" | "light" | "dark";

export const DASHBOARD_THEME_STORAGE_KEY = "ats-dashboard-theme";

/** Rough day window: 6:00–19:59 local = light; else dark (night). */
export function isDaylightHours(date = new Date()): boolean {
  const h = date.getHours();
  return h >= 6 && h < 20;
}

export function resolveEffectiveDark(mode: DashboardThemeMode, date = new Date()): boolean {
  if (mode === "light") return false;
  if (mode === "dark") return true;
  return !isDaylightHours(date);
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
  if (mode === "auto") return "Theme: Auto (day/night)";
  if (mode === "light") return "Theme: Light";
  return "Theme: Dark";
}
