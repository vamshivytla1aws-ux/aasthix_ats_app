"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { UI } from "@/lib/ui";

type FilterDrawerProps = {
  open: boolean;
  title?: string;
  onClose: () => void;
  onApply?: () => void;
  onReset?: () => void;
  children: React.ReactNode;
};

/**
 * Right-side filter panel (Oracle-style).
 */
export default function FilterDrawer({
  open,
  title = "Filters",
  onClose,
  onApply,
  onReset,
  children,
}: FilterDrawerProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-[1px] dark:bg-black/50"
        aria-label="Close filters"
        onClick={onClose}
      />
      <aside
        className="fixed right-0 top-0 z-[70] flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-drawer-title"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h2 id="filter-drawer-title" className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        <div className="flex gap-2 border-t border-slate-200 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-slate-700">
          {onReset ? (
            <button type="button" onClick={onReset} className={UI.secondaryButton + " flex-1 justify-center py-2 text-sm"}>
              Reset
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              onApply?.();
              onClose();
            }}
            className={UI.primaryButton + " flex-1 justify-center py-2 text-sm"}
          >
            Apply
          </button>
        </div>
      </aside>
    </>
  );
}
