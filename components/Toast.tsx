"use client";

import React, { useEffect } from "react";

export default function Toast({
  message,
  variant = "success",
  onClose,
  autoHideMs = 2500,
  requestId,
  detail,
}: {
  message: string;
  variant?: "success" | "error";
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
      : "border-rose-200 text-rose-800 bg-white";

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 max-w-sm">
      <div className={["pointer-events-auto rounded-2xl border px-4 py-2 shadow-sm text-sm", styles].join(" ")}>
        <div>{message}</div>
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

