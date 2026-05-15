"use client";

import React from "react";

export type OperationBannerTone = "success" | "partial" | "blocked" | "error" | "info";

const TONE_CLASS: Record<OperationBannerTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100",
  partial: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100",
  blocked: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100",
  error: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100",
  info: "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100",
};

export default function OperationResultBanner({
  tone = "info",
  message,
  hint,
  action,
}: {
  tone?: OperationBannerTone;
  message: string;
  hint?: string | null;
  action?: React.ReactNode;
}) {
  return (
    <div className={["rounded-xl border px-3 py-2 text-sm", TONE_CLASS[tone]].join(" ")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{message}</span>
        {action}
      </div>
      {hint ? <div className="mt-1 text-xs opacity-90">{hint}</div> : null}
    </div>
  );
}
