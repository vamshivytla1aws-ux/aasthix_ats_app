"use client";

import React from "react";

const PRESETS: Record<string, string> = {
  active:
    "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-200 dark:ring-emerald-700",
  placed:
    "bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-900/60 dark:text-violet-200 dark:ring-violet-700",
  screening:
    "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-900/60 dark:text-amber-200 dark:ring-amber-700",
  rejected:
    "bg-red-50 text-red-800 ring-red-200 dark:bg-red-900/60 dark:text-red-200 dark:ring-red-700",
  selected:
    "bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-900/60 dark:text-teal-200 dark:ring-teal-700",
  scheduled:
    "bg-sky-50 text-sky-900 ring-sky-200 dark:bg-sky-900/60 dark:text-sky-200 dark:ring-sky-700",
  present:
    "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-200 dark:ring-emerald-700",
  late:
    "bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-900/60 dark:text-amber-200 dark:ring-amber-700",
  absent:
    "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-900/60 dark:text-rose-200 dark:ring-rose-700",
  not_checked_in:
    "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600",
  unscheduled:
    "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600",
  unread:
    "bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-900/60 dark:text-blue-200 dark:ring-blue-700",
  read:
    "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600",
  expired:
    "bg-gray-100 text-gray-500 ring-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600",
  on_hold:
    "bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-900/60 dark:text-orange-200 dark:ring-orange-700",
  open:
    "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-200 dark:ring-emerald-700",
  closed:
    "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600",
  filled:
    "bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-900/60 dark:text-teal-200 dark:ring-teal-700",
  draft:
    "bg-gray-100 text-gray-600 ring-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:ring-gray-600",
  pending_approval:
    "bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-900/60 dark:text-indigo-200 dark:ring-indigo-700",
  critical:
    "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-900/60 dark:text-rose-200 dark:ring-rose-700",
  renew_soon:
    "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-900/60 dark:text-amber-200 dark:ring-amber-700",
  unknown:
    "bg-slate-100/90 text-slate-600 ring-slate-200/80 dark:bg-slate-800/80 dark:text-slate-300 dark:ring-slate-600",
  default:
    "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-600",
};

function resolveVariant(label: string): string {
  const s = label.trim().toLowerCase();

  if (s === "active" || s === "open") return "open";
  if (s === "present") return "present";
  if (s === "late") return "late";
  if (s === "absent") return "absent";
  if (s === "not checked in" || s === "not_checked_in") return "not_checked_in";
  if (s === "placed") return "placed";
  if (s === "selected") return "selected";
  if (s === "unread") return "unread";
  if (s === "read") return "read";
  if (s === "expired") return "expired";
  if (s === "draft") return "draft";
  if (s === "closed") return "closed";
  if (s === "filled") return "filled";
  if (s === "critical") return "critical";
  if (s === "unknown") return "unknown";

  if (s === "on hold" || s.includes("hold")) return "on_hold";
  if (s === "pending approval" || (s.includes("pending") && s.includes("approv")))
    return "pending_approval";
  if (s.includes("renew")) return "renew_soon";
  if (s.includes("screen")) return "screening";
  if (s.includes("reject")) return "rejected";
  if (s.includes("not scheduled") || s.includes("unscheduled")) return "unscheduled";
  if (s === "scheduled" || s.includes("scheduled")) return "scheduled";

  return "default";
}

export default function StatusBadge({ status }: { status: string }) {
  const v = resolveVariant(status);
  return (
    <span
      className={[
        "inline-flex max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        PRESETS[v],
      ].join(" ")}
    >
      {status}
    </span>
  );
}
