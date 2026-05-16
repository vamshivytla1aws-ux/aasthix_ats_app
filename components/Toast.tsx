"use client";

import React, { useEffect } from "react";

export type ToastTone = "success" | "partial" | "blocked" | "error" | "info";

export default function Toast({
  message,
  variant = "success",
  onClose,
  autoHideMs = 2500,
  requestId,
  detail,
}: {
  message: string;
  variant?: ToastTone;
  onClose: () => void;
  autoHideMs?: number;
  /** Shown in monospace for support correlation (from ApiError.requestId). */
  requestId?: string;
  detail?: string;
}) {
  useEffect(() => {
    const t = window.setTimeout(onClose, autoHideMs);
    return () => window.clearTimeout(t);
  }, [autoHideMs, onClose]);

  const styles =
    variant === "success"
      ? "border-emerald-200 text-emerald-800 bg-white"
      : variant === "partial"
        ? "border-amber-200 text-amber-800 bg-white"
        : variant === "blocked" || variant === "error"
          ? "border-rose-200 text-rose-800 bg-white"
          : "border-sky-200 text-sky-800 bg-white";

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 max-w-sm sm:max-w-md" aria-live="polite">
      <div className={["pointer-events-auto rounded-2xl border px-4 py-2 shadow-sm text-sm", styles].join(" ")}>
        <div className="flex items-start justify-between gap-3">
          <div>{message}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-1 text-xs font-semibold opacity-80 transition hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current/40"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
        {detail ? <div className="mt-1 text-xs opacity-90">{detail}</div> : null}
        {requestId ? (
          <div className="mt-1.5 border-t border-current/10 pt-1.5 text-[10px] font-mono opacity-80" title="Reference for support">
            Ref: {requestId}
          </div>
        ) : null}
      </div>
    </div>
  );
}
