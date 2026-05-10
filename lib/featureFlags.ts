function parseBool(value: string | undefined, defaultValue = false) {
  if (!value) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export const IA_V2_ENABLED = parseBool(process.env.NEXT_PUBLIC_IA_V2_ENABLED, false);
export const DASHBOARD_V2_ENABLED = parseBool(process.env.NEXT_PUBLIC_DASHBOARD_V2_ENABLED, false);
export const PERSONALIZATION_V2_ENABLED = parseBool(process.env.NEXT_PUBLIC_PERSONALIZATION_V2_ENABLED, false);
export const INTELLIGENCE_V3_ENABLED = parseBool(process.env.NEXT_PUBLIC_INTELLIGENCE_V3_ENABLED, false);
export const AUTOMATION_V3_ENABLED = parseBool(process.env.NEXT_PUBLIC_AUTOMATION_V3_ENABLED, false);
export const FORECAST_V3_ENABLED = parseBool(process.env.NEXT_PUBLIC_FORECAST_V3_ENABLED, false);
export const CALIBRATION_V3_ENABLED = parseBool(process.env.NEXT_PUBLIC_CALIBRATION_V3_ENABLED, false);
