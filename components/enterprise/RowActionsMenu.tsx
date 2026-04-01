"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Calendar, MoreVertical, Pencil, Trash2, User } from "lucide-react";

export type RowActionItem =
  | { type: "link"; label: string; href: string; icon?: React.ReactNode }
  | { type: "button"; label: string; onClick: () => void; icon?: React.ReactNode; danger?: boolean };

type RowActionsMenuProps = {
  ariaLabel?: string;
  items: RowActionItem[];
  onOpenChange?: (open: boolean) => void;
};

export default function RowActionsMenu({ ariaLabel = "Row actions", items, onOpenChange }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, i) => {
            const icon =
              item.icon ??
              (item.label.includes("Profile") ? (
                <User className="h-3.5 w-3.5" />
              ) : item.label.includes("Edit") ? (
                <Pencil className="h-3.5 w-3.5" />
              ) : item.label.includes("Interview") ? (
                <Calendar className="h-3.5 w-3.5" />
              ) : item.label.includes("Delete") ? (
                <Trash2 className="h-3.5 w-3.5" />
              ) : null);
            if (item.type === "link") {
              return (
                <Link
                  key={i}
                  href={item.href}
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                  onClick={() => setOpen(false)}
                >
                  {icon}
                  {item.label}
                </Link>
              );
            }
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={[
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800",
                  item.danger ? "text-red-600 dark:text-red-400" : "text-slate-700 dark:text-slate-200",
                ].join(" ")}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
              >
                {icon}
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
