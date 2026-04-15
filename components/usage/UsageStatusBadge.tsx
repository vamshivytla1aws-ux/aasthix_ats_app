"use client";

import React from "react";
import type { UsageHealthStatus } from "@/lib/usage/types";

const CLASSES: Record<UsageHealthStatus, string> = {
  Healthy:
    "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-200 dark:ring-emerald-700",
  Warning:
    "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-900/60 dark:text-amber-200 dark:ring-amber-700",
  "Near Limit":
    "bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-900/60 dark:text-orange-200 dark:ring-orange-700",
  "Limit Reached":
    "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-900/60 dark:text-rose-200 dark:ring-rose-700",
};

export default function UsageStatusBadge({ status }: { status: UsageHealthStatus }) {
  return (
    <span className={["inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", CLASSES[status]].join(" ")}>
      {status}
    </span>
  );
}
