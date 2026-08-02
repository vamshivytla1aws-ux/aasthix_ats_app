"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function ViewportPortal({ children, onClose, dirty = false, busy = false }: { children: ReactNode; onClose: () => void; dirty?: boolean; busy?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const requestClose = useCallback(() => {
    if (busy) return;
    if (dirty && !window.confirm("Discard the unsaved interview changes?")) return;
    onClose();
  }, [busy, dirty, onClose]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      const first = rootRef.current?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      first?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const activePopover = document.querySelector<HTMLElement>('[data-ats-dialog-popover][data-state="open"]');
      if (activePopover && (activePopover.contains(event.target as Node) || activePopover.contains(document.activeElement))) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !rootRef.current) return;
      const focusable = Array.from(rootRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={rootRef}
      className="contents"
      onClickCapture={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target?.closest("[data-viewport-close]")) return;
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }}
    >
      {children}
    </div>,
    document.body
  );
}
