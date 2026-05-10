export type WorkspaceDensity = "comfortable" | "compact" | "ultra";

export type WorkspacePreference = {
  default_landing: string | null;
  density: WorkspaceDensity;
  scope: Record<string, unknown>;
  filters: Record<string, unknown>;
  widget_pins: string[];
  updated_at: string | null;
};

export type WorkspaceLayout = {
  modules: Record<string, unknown>;
  dashboard: {
    widgets: string[];
    hidden_widgets: string[];
  };
  updated_at: string | null;
};

export type WorkspaceDefaults = {
  role: string;
  default_landing: string | null;
  density: WorkspaceDensity;
  scope: Record<string, unknown>;
  filters: Record<string, unknown>;
  widget_pins: string[];
  layout: Record<string, unknown>;
  updated_at: string | null;
};
