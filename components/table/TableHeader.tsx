"use client";

import React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

export type SortKey = "full_name" | "email" | "location" | "company" | null;
export type SortDir = "asc" | "desc" | null;

type TableHeaderProps = {
  label: string;
  columnKey?: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortToggle?: (columnKey: Exclude<SortKey, null>) => void;
  width?: number;
  onResizeStart?: (event: React.MouseEvent<HTMLSpanElement>, key: string) => void;
  resizeKey?: string;
  sticky?: boolean;
  align?: "left" | "right" | "center";
};

export default function TableHeader(props: TableHeaderProps) {
  const {
    label,
    columnKey,
    sortKey,
    sortDir,
    onSortToggle,
    width,
    onResizeStart,
    resizeKey,
    sticky = true,
    align = "left",
  } = props;

  const isSortable = !!columnKey && !!onSortToggle;
  const isActive = columnKey && sortKey === columnKey;
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <th
      style={typeof width === "number" ? { width } : undefined}
      className={[
        "px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500",
        alignCls,
        sticky
          ? "sticky top-0 z-20 border-b border-[var(--enterprise-table-border)] bg-[var(--enterprise-table-header)] dark:bg-slate-900/98"
          : "",
      ].join(" ")}
    >
      <div className="group relative flex items-center gap-1">
        {isSortable ? (
          <button
            type="button"
            onClick={() => onSortToggle(columnKey as Exclude<SortKey, null>)}
            className={[
              "inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors",
              isActive ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
            ].join(" ")}
          >
            <span>{label}</span>
            {isActive ? (sortDir === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ChevronsUpDown size={14} />}
          </button>
        ) : (
          <span>{label}</span>
        )}

        {onResizeStart && resizeKey ? (
          <span
            onMouseDown={(e) => onResizeStart(e, resizeKey)}
            className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none opacity-0 group-hover:opacity-100"
            title="Resize column"
          />
        ) : null}
      </div>
    </th>
  );
}

