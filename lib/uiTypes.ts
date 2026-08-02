import type { ReactNode } from "react";

export type DateValue = string;
export type DateRangeValue = { from: string; to: string };
export type DateTimeValue = string;
export type TableDensity = "compact" | "comfortable";
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export type BreadcrumbItem = { label: string; href?: string };
export type PageAction = { label: string; href?: string; onClick?: () => void; icon?: ReactNode; primary?: boolean };
export type IdentityLinkTarget = { kind: "candidate" | "job"; id: string | number; label: string };

export type TableColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  priority?: "primary" | "secondary" | "optional";
  width?: number;
  sticky?: "left" | "right";
};

export type TableView = {
  id: string;
  label: string;
  visibleColumns: string[];
  density: TableDensity;
};
