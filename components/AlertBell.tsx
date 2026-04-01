"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiFetchJson } from "@/lib/apiClient";
import { AnimatePresence, motion } from "framer-motion";

type AlertRow = {
  id: number;
  type: string;
  message: string;
  created_at: string;
  status: "unread" | "read" | "expired";
  expires_at: string | null;
  candidate_id?: number | null;
};

function normalizeAlertId(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeRows(rows: AlertRow[]): AlertRow[] {
  return (rows || []).map((a) => {
    const id = normalizeAlertId(a.id);
    const candidateId = normalizeAlertId((a as AlertRow).candidate_id);
    const base = { ...a, candidate_id: candidateId };
    return id != null ? { ...base, id } : base;
  });
}

function formatTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

export default function AlertBell({ variant = "default" }: { variant?: "default" | "shell" }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [dismissingIds, setDismissingIds] = useState<number[]>([]);
  const [dismissedIds, setDismissedIds] = useState<number[]>([]);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const activeAlerts = useMemo(
    () =>
      alerts.filter((a) => {
        const notExpired = !a.expires_at || new Date(a.expires_at).getTime() > Date.now();
        return a.status === "unread" && notExpired;
      }),
    [alerts]
  );

  const visibleAlerts = useMemo(
    () =>
      activeAlerts
        .filter((a) => {
          const nid = normalizeAlertId(a.id);
          return nid != null && !dismissedIds.includes(nid);
        })
        .slice(0, 10),
    [activeAlerts, dismissedIds]
  );
  const alertCount = activeAlerts.filter((a) => {
    const nid = normalizeAlertId(a.id);
    return nid != null && !dismissedIds.includes(nid);
  }).length;

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetchJson<{ alerts: AlertRow[] }>("/api/alerts");
      const next = normalizeRows(data.alerts || []);
      setAlerts(next);
      // Keep dismiss cache clean for removed/expired alerts.
      setDismissedIds((prev) =>
        prev.filter((did) => next.some((a) => normalizeAlertId(a.id) === did))
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      load();
    }, 60_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!open) return;
      const el = dropdownRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    }

    function onDocKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [open]);

  async function markAsRead(rawId: unknown) {
    const id = normalizeAlertId(rawId);
    if (id == null) {
      console.error("Alert ID missing/invalid");
      return;
    }
    setDismissingIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    try {
      await apiFetchJson("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      setAlerts((prev) =>
        prev.map((a) => (normalizeAlertId(a.id) === id ? { ...a, status: "read", expires_at: a.expires_at } : a))
      );
    } catch (err) {
      // Revert optimistic hide if server rejected update
      setDismissedIds((prev) => prev.filter((x) => x !== id));
      console.error("Failed to dismiss alert", err);
    } finally {
      setDismissingIds((prev) => prev.filter((x) => x !== id));
    }
  }

  async function handleRemove(rawId: unknown) {
    const id = normalizeAlertId(rawId);
    if (id == null) {
      console.error("Alert ID missing/invalid");
      return;
    }
    setDismissedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    await markAsRead(id);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          variant === "shell"
            ? "relative rounded-lg border border-white/30 bg-white/15 px-3 py-2 text-white transition hover:bg-white/25"
            : "relative rounded-xl border border-gray-200 bg-white px-3 py-2 text-slate-700 shadow-ats-sm transition duration-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700"
        }
        aria-label="Alerts"
      >
        <span className="text-lg leading-none">🔔</span>
        {alertCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 animate-pulse rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {alertCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-12 z-50 w-96 max-h-96 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-3 shadow-ats dark:border-slate-600 dark:bg-slate-900 dark:shadow-none"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Notifications</div>
              {loading && <div className="text-xs text-slate-500 dark:text-slate-400">Loading…</div>}
            </div>

            {alerts.length === 0 && !loading ? (
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                No alerts.
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {visibleAlerts.map((a) => {
                    const isRead = a.status !== "unread";
                    const rowId = normalizeAlertId(a.id);
                    return (
                      <motion.div
                        key={rowId ?? String(a.message)}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                        className={[
                          "w-full rounded-xl border border-slate-200 p-3 text-left transition dark:border-slate-600",
                          isRead ? "opacity-60" : "hover:bg-slate-50 dark:hover:bg-slate-800/80",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div
                              className={[
                                "text-sm font-medium text-slate-900 dark:text-slate-100",
                                isRead ? "line-through" : "",
                              ].join(" ")}
                            >
                              {a.message}
                            </div>
                            {a.candidate_id != null && a.candidate_id > 0 ? (
                              <div className="mt-1.5">
                                <Link
                                  href={`/candidates/${a.candidate_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Open profile
                                </Link>
                              </div>
                            ) : null}
                            <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                              {formatTime(a.created_at)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void handleRemove(a.id);
                            }}
                            disabled={rowId != null && dismissingIds.includes(rowId)}
                            className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-700"
                            title="Dismiss alert"
                            aria-label="Dismiss alert"
                          >
                            {rowId != null && dismissingIds.includes(rowId) ? "..." : "×"}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

