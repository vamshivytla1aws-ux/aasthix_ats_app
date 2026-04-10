"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import Link from "next/link";
import { Calendar, MoreVertical, Pencil, Trash2, User } from "lucide-react";

const MENU_WIDTH = 208; // w-52

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
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  /** Anchor menu to the trigger (portal + fixed). Floating UI avoids bad math when innerHeight/scroll is odd. */
  useLayoutEffect(() => {
    if (!open) return;

    const trigger = triggerRef.current;
    if (!trigger) return;

    let cleaned = false;
    let cancelAuto: (() => void) | undefined;
    /** One frame so the portaled menu node exists and layout is stable (tables, motion, etc.). */
    const frameId = requestAnimationFrame(() => {
      const menu = menuRef.current;
      if (!menu || cleaned) return;
      menu.style.visibility = "hidden";

      cancelAuto = autoUpdate(trigger, menu, () => {
        computePosition(trigger, menu, {
          placement: "bottom-end",
          strategy: "fixed",
          middleware: [
            offset(4),
            flip({ fallbackPlacements: ["top-end", "bottom-start", "top-start"] }),
            shift({ padding: 8 }),
          ],
        }).then(({ x, y }) => {
          if (cleaned) return;
          Object.assign(menu.style, {
            left: `${Math.round(x)}px`,
            top: `${Math.round(y)}px`,
            visibility: "visible",
          });
        });
      });
    });

    return () => {
      cleaned = true;
      cancelAnimationFrame(frameId);
      cancelAuto?.();
    };
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const menuContent = open ? (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: MENU_WIDTH,
        zIndex: 9999,
        visibility: "hidden",
      }}
      className="max-h-[min(320px,calc(100vh-16px))] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg outline-none dark:border-slate-600 dark:bg-slate-900"
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
              className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
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
              "flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-100 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800",
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
  ) : null;

  return (
    <div className="relative inline-block text-left" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:ring-offset-slate-900 md:min-h-0 md:h-8 md:min-w-0"
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
      {typeof document !== "undefined" && menuContent ? createPortal(menuContent, document.body) : null}
    </div>
  );
}
