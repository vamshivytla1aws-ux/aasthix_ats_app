"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, EyeOff, RotateCcw } from "lucide-react";
import type { Density } from "@/lib/useDensity";
import { UI } from "@/lib/ui";

export type ModuleDataTableColumn<T> = {
  id: string;
  header: string;
  /** Persisted visibility default when no saved prefs */
  defaultVisible?: boolean;
  /** Initial / min width for resize (px) */
  defaultWidth?: number;
  /** CSV cell (required for export) */
  csvValue: (row: T) => string;
  cell: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  priority?: "primary" | "secondary" | "optional";
  sticky?: "left" | "right";
};

export type ModuleDataTableColumnPreset = {
  id: string;
  label: string;
  /** Column id → visible */
  visible: Record<string, boolean>;
};

export type ModuleDataTableProps<T> = {
  rows: T[];
  rowKey: (row: T) => string | number;
  columns: ModuleDataTableColumn<T>[];
  onRowClick?: (row: T) => void;
  selectedRowKey?: string | number | null;
  /** localStorage key for table prefs (visibility, widths, order) */
  storageKey: string;
  density?: Density;
  /** CSV download filename without extension */
  exportBasename?: string;
  /** If set, CSV uses these rows (e.g. parent’s filtered dataset). Defaults to sorted in-table rows. */
  exportRows?: T[];
  emptyMessage?: React.ReactNode;
  /** Scrollable body; header stays sticky inside this region */
  maxBodyHeight?: string;
  /** Extra controls rendered left of Columns / Export */
  toolbarLeft?: React.ReactNode;
  /** Optional named column layouts (saved sets) */
  columnPresets?: ModuleDataTableColumnPreset[];
  /** Enable virtualized tbody when row count exceeds threshold */
  virtualize?: boolean;
  virtualizeThreshold?: number;
  estimatedRowHeight?: number;
};

type TablePrefsV2 = {
  v: 2;
  visible: Record<string, boolean>;
  widths: Record<string, number>;
  order: string[];
};

function escapeCsvCell(value: string) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parsePrefs(raw: string | null, columns: ModuleDataTableColumn<unknown>[]): TablePrefsV2 | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "v" in parsed && (parsed as TablePrefsV2).v === 2) {
      const p = parsed as TablePrefsV2;
      return {
        v: 2,
        visible: typeof p.visible === "object" && p.visible ? p.visible : {},
        widths: typeof p.widths === "object" && p.widths ? p.widths : {},
        order: Array.isArray(p.order) ? p.order : [],
      };
    }
    if (parsed && typeof parsed === "object" && parsed !== null && !("v" in parsed)) {
      const vis = parsed as Record<string, boolean>;
      return {
        v: 2,
        visible: vis,
        widths: {},
        order: columns.map((c) => c.id),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function defaultPrefs(columns: ModuleDataTableColumn<unknown>[]): TablePrefsV2 {
  const visible: Record<string, boolean> = {};
  const widths: Record<string, number> = {};
  for (const c of columns) {
    visible[c.id] = c.defaultVisible !== false;
    widths[c.id] = c.defaultWidth ?? 140;
  }
  return { v: 2, visible, widths, order: columns.map((c) => c.id) };
}

/** Standalone CSV helper for pages that don’t use the table shell */
export function exportRowsToCsv<T>(
  rows: T[],
  columns: Array<{ id: string; header: string; csvValue: (row: T) => string }>,
  filenameBase: string
) {
  const headers = columns.map((c) => c.header);
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvCell(c.csvValue(row))).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ModuleDataTable<T>({
  rows,
  rowKey,
  columns,
  onRowClick,
  selectedRowKey,
  storageKey,
  density = "compact",
  exportBasename = "export",
  exportRows,
  emptyMessage,
  maxBodyHeight = "min(70vh, 720px)",
  toolbarLeft,
  columnPresets,
  virtualize = false,
  virtualizeThreshold = 80,
  estimatedRowHeight = 44,
}: ModuleDataTableProps<T>) {
  const defaults = useMemo(() => defaultPrefs(columns as ModuleDataTableColumn<unknown>[]), [columns]);

  const [visible, setVisible] = useState<Record<string, boolean>>(defaults.visible);
  const [widths, setWidths] = useState<Record<string, number>>(defaults.widths);
  const [order, setOrder] = useState<string[]>(defaults.order);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showColMenu, setShowColMenu] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);
  const resizingRef = useRef<{ id: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const p = parsePrefs(raw, columns as ModuleDataTableColumn<unknown>[]);
      if (!p) return;
      setVisible((prev) => {
        const next = { ...prev };
        for (const c of columns) {
          if (c.id in p.visible) next[c.id] = p.visible[c.id];
        }
        return next;
      });
      setWidths((prev) => ({ ...prev, ...p.widths }));
      const known = new Set(columns.map((c) => c.id));
      const ord = p.order.filter((id) => known.has(id));
      const missing = columns.map((c) => c.id).filter((id) => !ord.includes(id));
      setOrder([...ord, ...missing]);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load prefs when table identity (storageKey) changes
  }, [storageKey]);

  useEffect(() => {
    try {
      const payload: TablePrefsV2 = { v: 2, visible, widths, order };
      window.localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [storageKey, visible, widths, order]);

  const orderedColumns = useMemo(() => {
    const byId = new Map(columns.map((c) => [c.id, c] as const));
    const list: ModuleDataTableColumn<T>[] = [];
    for (const id of order) {
      const c = byId.get(id);
      if (c) list.push(c);
    }
    for (const c of columns) {
      if (!list.includes(c)) list.push(c);
    }
    return list;
  }, [columns, order]);

  const activeColumns = useMemo(
    () => orderedColumns.filter((c) => visible[c.id] !== false),
    [orderedColumns, visible]
  );

  const sortedRows = useMemo(() => {
    if (!sortCol) return rows;
    const col = columns.find((c) => c.id === sortCol);
    if (!col?.sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      const na = typeof va === "number" ? va : String(va).toLowerCase();
      const nb = typeof vb === "number" ? vb : String(vb).toLowerCase();
      let cmp = 0;
      if (typeof na === "number" && typeof nb === "number") cmp = na - nb;
      else cmp = String(na).localeCompare(String(nb), undefined, { sensitivity: "base" });
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortCol, sortDir, columns]);

  const rowsForExport = exportRows ?? sortedRows;

  const doVirtualize = virtualize && sortedRows.length > virtualizeThreshold;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !doVirtualize) return;
    const ro = new ResizeObserver(() => {
      setViewportH(el.clientHeight || 480);
    });
    ro.observe(el);
    setViewportH(el.clientHeight || 480);
    return () => ro.disconnect();
  }, [doVirtualize, maxBodyHeight, rows.length]);

  const virtualWindow = useMemo(() => {
    if (!doVirtualize) {
      return { start: 0, end: sortedRows.length, padTop: 0, padBottom: 0 };
    }
    const rowH = estimatedRowHeight;
    const start = Math.max(0, Math.floor(scrollTop / rowH) - 3);
    const visCount = Math.ceil(viewportH / rowH) + 6;
    const end = Math.min(sortedRows.length, start + visCount);
    const padTop = start * rowH;
    const padBottom = (sortedRows.length - end) * rowH;
    return { start, end, padTop, padBottom };
  }, [doVirtualize, sortedRows.length, scrollTop, viewportH, estimatedRowHeight]);

  const visibleRows = doVirtualize ? sortedRows.slice(virtualWindow.start, virtualWindow.end) : sortedRows;

  const toggleSort = useCallback(
    (id: string) => {
      const col = columns.find((c) => c.id === id);
      if (!col?.sortValue) return;
      setSortCol((prev) => {
        if (prev !== id) {
          setSortDir("asc");
          return id;
        }
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return id;
      });
    },
    [columns]
  );

  function exportCsv() {
    exportRowsToCsv(
      rowsForExport,
      activeColumns.map((c) => ({ id: c.id, header: c.header, csvValue: c.csvValue })),
      exportBasename
    );
  }

  function resetLayout() {
    const d = defaultPrefs(columns as ModuleDataTableColumn<unknown>[]);
    setVisible(d.visible);
    setWidths(d.widths);
    setOrder(d.order);
    setSortCol(null);
    setSortDir("asc");
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }

  function applyPreset(preset: ModuleDataTableColumnPreset) {
    setVisible((prev) => {
      const next = { ...prev };
      for (const c of columns) {
        next[c.id] = preset.visible[c.id] !== false;
      }
      return next;
    });
    setPresetMenuOpen(false);
  }

  function onResizeStart(e: React.MouseEvent, colId: string) {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      id: colId,
      startX: e.clientX,
      startWidth: widths[colId] ?? defaults.widths[colId] ?? 140,
    };
    function onMove(ev: MouseEvent) {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const w = Math.max(72, Math.min(560, resizingRef.current.startWidth + delta));
      setWidths((prev) => ({ ...prev, [resizingRef.current!.id]: w }));
    }
    function onUp() {
      resizingRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const thPad =
    density === "comfortable" ? "px-4 py-3.5" : density === "compact" ? "px-4 py-3" : "px-3 py-2.5";
  const tdPad =
    density === "comfortable" ? "px-4 py-4" : density === "compact" ? "px-4 py-3.5" : "px-3 py-2.5";

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400">
        {emptyMessage ?? "No rows to display."}
      </div>
    );
  }

  const colCount = activeColumns.length;

  return (
    <div className="rounded-[var(--ats-radius-lg)] border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] shadow-[var(--ats-shadow-sm)]">
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-[var(--ats-border)] px-3 py-2.5">
        {toolbarLeft ? <div className="mr-auto flex flex-wrap items-center gap-2">{toolbarLeft}</div> : null}
        {columnPresets && columnPresets.length > 0 ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setPresetMenuOpen((p) => !p)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Layouts
            </button>
            {presetMenuOpen ? (
              <div className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-slate-600 dark:bg-slate-900">
                {columnPresets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-gray-50 dark:hover:bg-slate-800"
                    onClick={() => applyPreset(p)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          onClick={resetLayout}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          title="Reset column widths and visibility to defaults"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowColMenu((p) => !p)}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <EyeOff className="h-3.5 w-3.5" />
            Columns
          </button>
          {showColMenu ? (
            <div className="absolute right-0 z-30 mt-1 max-h-64 w-52 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-slate-600 dark:bg-slate-900">
              {orderedColumns.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={visible[c.id] !== false}
                    onChange={(e) => setVisible((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                  />
                  <span>{c.header}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className={UI.secondaryButton + " py-1.5 text-xs"}
          title={`Export ${rowsForExport.length} row(s). Uses filtered rows when the page passes exportRows.`}
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-auto"
        style={{ maxHeight: maxBodyHeight }}
        onScroll={(e) => {
          if (doVirtualize) setScrollTop(e.currentTarget.scrollTop);
        }}
      >
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--ats-border)] bg-[var(--enterprise-table-header)]">
              {activeColumns.map((c) => {
                const align = c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left";
                const sortable = Boolean(c.sortValue);
                const w = widths[c.id] ?? c.defaultWidth ?? 140;
                return (
                  <th
                    key={c.id}
                    style={{ width: w, minWidth: 72, maxWidth: 560 }}
                    className={[
                      thPad,
                      align,
                      "relative sticky top-0 z-10 border-b border-[var(--ats-border)] bg-[var(--enterprise-table-header)] text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ats-text-muted)]",
                      c.priority === "optional" ? "hidden lg:table-cell" : c.priority === "secondary" ? "hidden sm:table-cell" : "",
                      c.sticky === "left" ? "left-0 z-20" : "",
                      c.sticky === "right" ? "right-0 z-20" : "",
                    ].join(" ")}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.id)}
                        className={[
                          "inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800",
                          sortCol === c.id ? "text-blue-700 dark:text-blue-300" : "",
                        ].join(" ")}
                      >
                        <span className="truncate">{c.header}</span>
                        {sortCol === c.id ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    ) : (
                      <span className="truncate">{c.header}</span>
                    )}
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      className="absolute right-0 top-0 z-20 h-full w-1 cursor-col-resize select-none hover:bg-blue-400/60"
                      onMouseDown={(e) => onResizeStart(e, c.id)}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {doVirtualize && virtualWindow.padTop > 0 ? (
              <tr aria-hidden className="pointer-events-none">
                <td colSpan={colCount} style={{ height: virtualWindow.padTop, padding: 0, border: 0 }} />
              </tr>
            ) : null}
            {visibleRows.map((row, i) => {
              const globalIdx = doVirtualize ? virtualWindow.start + i : i;
              const striped = globalIdx % 2 === 1;
              const currentRowKey = rowKey(row);
              const isSelected = selectedRowKey != null && String(selectedRowKey) === String(currentRowKey);
              return (
                <tr
                  key={String(currentRowKey)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={[
                    onRowClick ? "cursor-pointer" : "",
                    striped ? "bg-[color:color-mix(in_oklab,var(--ats-bg-panel)_52%,transparent)]" : "",
                    isSelected ? "!bg-[var(--ats-selection)]" : "",
                    "group hover:bg-[var(--enterprise-row-hover)]",
                  ].join(" ")}
                >
                  {activeColumns.map((c) => {
                    const align =
                      c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left";
                    const w = widths[c.id] ?? c.defaultWidth ?? 140;
                    return (
                      <td
                        key={c.id}
                        style={{ width: w }}
                        className={[
                          tdPad,
                          align,
                          "border-b border-[var(--ats-border-subtle)] text-[var(--ats-text)]",
                          c.priority === "optional" ? "hidden lg:table-cell" : c.priority === "secondary" ? "hidden sm:table-cell" : "",
                          c.sticky === "left" ? "sticky left-0 z-10 bg-[var(--ats-bg-elevated)] group-hover:bg-[var(--enterprise-row-hover)]" : "",
                          c.sticky === "right" ? "sticky right-0 z-10 bg-[var(--ats-bg-elevated)] group-hover:bg-[var(--enterprise-row-hover)]" : "",
                        ].join(" ")}
                      >
                        {c.cell(row)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {doVirtualize && virtualWindow.padBottom > 0 ? (
              <tr aria-hidden className="pointer-events-none">
                <td colSpan={colCount} style={{ height: virtualWindow.padBottom, padding: 0, border: 0 }} />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
