import { query } from "@/lib/db";
import { normalizeRole } from "@/lib/rbac";
import type { WorkspaceDefaults, WorkspaceLayout, WorkspacePreference } from "@/lib/workspace/types";

const DEFAULT_DENSITY = "compact";

type PrefRow = {
  user_id: number;
  default_landing: string | null;
  density: string | null;
  scope: Record<string, unknown> | null;
  filters: Record<string, unknown> | null;
  widget_pins: unknown[] | null;
  layout: Record<string, unknown> | null;
  updated_at: string | null;
};

function normalizeDensity(value: string | null | undefined) {
  if (value === "comfortable" || value === "compact" || value === "ultra") return value;
  return DEFAULT_DENSITY;
}

function asStringList(value: unknown[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function rowToPreference(row: PrefRow | null): WorkspacePreference {
  return {
    default_landing: row?.default_landing ?? null,
    density: normalizeDensity(row?.density),
    scope: normalizeObject(row?.scope),
    filters: normalizeObject(row?.filters),
    widget_pins: asStringList(row?.widget_pins),
    updated_at: row?.updated_at ?? null,
  };
}

function rowToLayout(row: PrefRow | null): WorkspaceLayout {
  const rawLayout = normalizeObject(row?.layout);
  const dashboardLayout = normalizeObject(rawLayout.dashboard);
  return {
    modules: normalizeObject(rawLayout.modules),
    dashboard: {
      widgets: asStringList((dashboardLayout.widgets as unknown[]) ?? []),
      hidden_widgets: asStringList((dashboardLayout.hidden_widgets as unknown[]) ?? []),
    },
    updated_at: row?.updated_at ?? null,
  };
}

export async function getWorkspacePreferences(userId: number): Promise<WorkspacePreference> {
  const res = await query(
    `SELECT user_id, default_landing, density, scope, filters, widget_pins, layout, updated_at
     FROM workspace_user_preferences
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  const row = (res.rows[0] as PrefRow | undefined) ?? null;
  return rowToPreference(row);
}

export async function updateWorkspacePreferences(userId: number, patch: Partial<WorkspacePreference>) {
  const existing = await getWorkspacePreferences(userId);
  const next = {
    default_landing: patch.default_landing ?? existing.default_landing ?? "/dashboard",
    density: normalizeDensity(patch.density ?? existing.density),
    scope: normalizeObject(patch.scope ?? existing.scope),
    filters: normalizeObject(patch.filters ?? existing.filters),
    widget_pins: Array.isArray(patch.widget_pins) ? patch.widget_pins : existing.widget_pins,
  };
  const res = await query(
    `INSERT INTO workspace_user_preferences (user_id, default_landing, density, scope, filters, widget_pins, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
      default_landing = EXCLUDED.default_landing,
      density = EXCLUDED.density,
      scope = EXCLUDED.scope,
      filters = EXCLUDED.filters,
      widget_pins = EXCLUDED.widget_pins,
      updated_at = NOW()
     RETURNING user_id, default_landing, density, scope, filters, widget_pins, layout, updated_at`,
    [userId, next.default_landing, next.density, JSON.stringify(next.scope), JSON.stringify(next.filters), JSON.stringify(next.widget_pins)]
  );
  return rowToPreference(res.rows[0] as PrefRow);
}

export async function getWorkspaceLayout(userId: number): Promise<WorkspaceLayout> {
  const res = await query(
    `SELECT user_id, default_landing, density, scope, filters, widget_pins, layout, updated_at
     FROM workspace_user_preferences
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  const row = (res.rows[0] as PrefRow | undefined) ?? null;
  return rowToLayout(row);
}

export async function updateWorkspaceLayout(userId: number, layout: WorkspaceLayout["modules"], dashboard: WorkspaceLayout["dashboard"]) {
  const mergedLayout = {
    modules: normalizeObject(layout),
    dashboard: {
      widgets: asStringList(dashboard.widgets),
      hidden_widgets: asStringList(dashboard.hidden_widgets),
    },
  };
  const res = await query(
    `INSERT INTO workspace_user_preferences (user_id, layout, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
      layout = EXCLUDED.layout,
      updated_at = NOW()
     RETURNING user_id, default_landing, density, scope, filters, widget_pins, layout, updated_at`,
    [userId, JSON.stringify(mergedLayout)]
  );
  return rowToLayout(res.rows[0] as PrefRow);
}

export async function getWorkspaceDefaults(roleRaw: string): Promise<WorkspaceDefaults> {
  const role = normalizeRole(roleRaw);
  const res = await query(
    `SELECT role, default_landing, density, scope, filters, widget_pins, layout, updated_at
     FROM workspace_role_defaults
     WHERE role = $1
     LIMIT 1`,
    [role]
  );
  const row = res.rows[0] as
    | {
        role: string;
        default_landing: string | null;
        density: string | null;
        scope: Record<string, unknown> | null;
        filters: Record<string, unknown> | null;
        widget_pins: unknown[] | null;
        layout: Record<string, unknown> | null;
        updated_at: string | null;
      }
    | undefined;

  return {
    role,
    default_landing: row?.default_landing ?? "/dashboard",
    density: normalizeDensity(row?.density),
    scope: normalizeObject(row?.scope),
    filters: normalizeObject(row?.filters),
    widget_pins: asStringList(row?.widget_pins),
    layout: normalizeObject(row?.layout),
    updated_at: row?.updated_at ?? null,
  };
}
