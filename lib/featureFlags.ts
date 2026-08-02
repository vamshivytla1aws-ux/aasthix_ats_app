function parseBool(value: string | undefined, defaultValue = false) {
  if (!value) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

type FlagResolution = {
  value: boolean;
  source: string;
};

function resolveFlag(primaryKey: string, fallbackKey: string, defaultValue = false): FlagResolution {
  const primary = process.env[primaryKey];
  if (primary !== undefined) {
    return { value: parseBool(primary, defaultValue), source: primaryKey };
  }
  const fallback = process.env[fallbackKey];
  if (fallback !== undefined) {
    return { value: parseBool(fallback, defaultValue), source: fallbackKey };
  }
  return { value: defaultValue, source: "default(false)" };
}

const IA_V2 = resolveFlag("NEXT_PUBLIC_IA_V2_ENABLED", "IA_V2_ENABLED");
const DASHBOARD_V2 = resolveFlag("NEXT_PUBLIC_DASHBOARD_V2_ENABLED", "DASHBOARD_V2_ENABLED");
const PERSONALIZATION_V2 = resolveFlag("NEXT_PUBLIC_PERSONALIZATION_V2_ENABLED", "PERSONALIZATION_V2_ENABLED");
const INTELLIGENCE_V3 = resolveFlag("NEXT_PUBLIC_INTELLIGENCE_V3_ENABLED", "INTELLIGENCE_V3_ENABLED");
const AUTOMATION_V3 = resolveFlag("NEXT_PUBLIC_AUTOMATION_V3_ENABLED", "AUTOMATION_V3_ENABLED");
const FORECAST_V3 = resolveFlag("NEXT_PUBLIC_FORECAST_V3_ENABLED", "FORECAST_V3_ENABLED");
const CALIBRATION_V3 = resolveFlag("NEXT_PUBLIC_CALIBRATION_V3_ENABLED", "CALIBRATION_V3_ENABLED");
const ORG_GOVERNANCE_V4 = resolveFlag("NEXT_PUBLIC_ORG_GOVERNANCE_V4_ENABLED", "ORG_GOVERNANCE_V4_ENABLED");
const COMPLIANCE_V4 = resolveFlag("NEXT_PUBLIC_COMPLIANCE_V4_ENABLED", "COMPLIANCE_V4_ENABLED");
const INTEGRATIONS_V4 = resolveFlag("NEXT_PUBLIC_INTEGRATIONS_V4_ENABLED", "INTEGRATIONS_V4_ENABLED");
const SRE_HARDENING_V4 = resolveFlag("NEXT_PUBLIC_SRE_HARDENING_V4_ENABLED", "SRE_HARDENING_V4_ENABLED");
const AI_GOVERNANCE_V4 = resolveFlag("NEXT_PUBLIC_AI_GOVERNANCE_V4_ENABLED", "AI_GOVERNANCE_V4_ENABLED");
const UI_REFRESH_V2 = resolveFlag("NEXT_PUBLIC_UI_REFRESH_V2_ENABLED", "UI_REFRESH_V2_ENABLED", true);
const CHAT_UI_V2 = resolveFlag("NEXT_PUBLIC_CHAT_UI_V2_ENABLED", "CHAT_UI_V2_ENABLED", true);

export const IA_V2_ENABLED = IA_V2.value;
export const DASHBOARD_V2_ENABLED = DASHBOARD_V2.value;
export const PERSONALIZATION_V2_ENABLED = PERSONALIZATION_V2.value;
export const INTELLIGENCE_V3_ENABLED = INTELLIGENCE_V3.value;
export const AUTOMATION_V3_ENABLED = AUTOMATION_V3.value;
export const FORECAST_V3_ENABLED = FORECAST_V3.value;
export const CALIBRATION_V3_ENABLED = CALIBRATION_V3.value;
export const ORG_GOVERNANCE_V4_ENABLED = ORG_GOVERNANCE_V4.value;
export const COMPLIANCE_V4_ENABLED = COMPLIANCE_V4.value;
export const INTEGRATIONS_V4_ENABLED = INTEGRATIONS_V4.value;
export const SRE_HARDENING_V4_ENABLED = SRE_HARDENING_V4.value;
export const AI_GOVERNANCE_V4_ENABLED = AI_GOVERNANCE_V4.value;
export const UI_REFRESH_V2_ENABLED = UI_REFRESH_V2.value;
export const CHAT_UI_V2_ENABLED = CHAT_UI_V2.value;

export const INTELLIGENCE_V3_FLAG_SOURCE = INTELLIGENCE_V3.source;
export const ORG_GOVERNANCE_V4_FLAG_SOURCE = ORG_GOVERNANCE_V4.source;
export const COMPLIANCE_V4_FLAG_SOURCE = COMPLIANCE_V4.source;
export const INTEGRATIONS_V4_FLAG_SOURCE = INTEGRATIONS_V4.source;
export const SRE_HARDENING_V4_FLAG_SOURCE = SRE_HARDENING_V4.source;
export const AI_GOVERNANCE_V4_FLAG_SOURCE = AI_GOVERNANCE_V4.source;
