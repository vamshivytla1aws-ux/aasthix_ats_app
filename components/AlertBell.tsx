"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BellRing, ExternalLink, Loader2, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { apiFetchJson } from "@/lib/apiClient";

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
  return (rows || []).map((alert) => {
    const id = normalizeAlertId(alert.id);
    const candidateId = normalizeAlertId(alert.candidate_id);
    const base = { ...alert, candidate_id: candidateId };
    return id != null ? { ...base, id } : base;
  });
}

function formatTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "--";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function toneForType(type: string) {
  const key = String(type || "").toLowerCase();
  if (key.includes("reject") || key.includes("risk") || key.includes("expired")) {
    return "border-[color:rgb(239_68_68_/_0.18)] bg-[color:rgb(239_68_68_/_0.08)] text-[var(--ats-danger)]";
  }
  if (key.includes("interview") || key.includes("renewal") || key.includes("approval")) {
    return "border-[color:rgb(245_158_11_/_0.18)] bg-[color:rgb(245_158_11_/_0.08)] text-[var(--ats-warning)]";
  }
  return "border-[color:rgb(37_99_235_/_0.18)] bg-[color:rgb(37_99_235_/_0.08)] text-[var(--ats-primary)]";
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
      alerts.filter((alert) => {
        const notExpired = !alert.expires_at || new Date(alert.expires_at).getTime() > Date.now();
        return alert.status === "unread" && notExpired;
      }),
    [alerts]
  );

  const visibleAlerts = useMemo(
    () =>
      activeAlerts
        .filter((alert) => {
          const normalizedId = normalizeAlertId(alert.id);
          return normalizedId != null && !dismissedIds.includes(normalizedId);
        })
        .slice(0, 10),
    [activeAlerts, dismissedIds]
  );

  const alertCount = activeAlerts.filter((alert) => {
    const normalizedId = normalizeAlertId(alert.id);
    return normalizedId != null && !dismissedIds.includes(normalizedId);
  }).length;

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetchJson<{ alerts: AlertRow[] }>("/api/alerts");
      const next = normalizeRows(data.alerts || []);
      setAlerts(next);
      setDismissedIds((prev) =>
        prev.filter((dismissedId) => next.some((alert) => normalizeAlertId(alert.id) === dismissedId))
      );
    } catch (err) {
      console.warn("AlertBell: could not load alerts", err);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 60_000);
    return () => window.clearInterval(timer);
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
    if (id == null) return;

    setDismissingIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    try {
      await apiFetchJson("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      setAlerts((prev) =>
        prev.map((alert) =>
          normalizeAlertId(alert.id) === id ? { ...alert, status: "read", expires_at: alert.expires_at } : alert
        )
      );
    } catch (err) {
      setDismissedIds((prev) => prev.filter((x) => x !== id));
      console.error("Failed to dismiss alert", err);
    } finally {
      setDismissingIds((prev) => prev.filter((x) => x !== id));
    }
  }

  async function handleRemove(rawId: unknown) {
    const id = normalizeAlertId(rawId);
    if (id == null) return;
    setDismissedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    await markAsRead(id);
  }

  const triggerClassName =
    variant === "shell"
      ? "relative inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 p-2.5 text-white shadow-[0_16px_44px_-28px_rgba(15,23,42,0.9)] backdrop-blur-sm transition hover:bg-white/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
      : "relative inline-flex items-center justify-center rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-2.5 text-[var(--ats-text)] shadow-[var(--ats-shadow-sm)] transition hover:border-[var(--ats-border-strong)] hover:bg-[var(--ats-bg-panel-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(37_99_235_/_0.16)]";

  return (
    <div className="relative" ref={dropdownRef}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={triggerClassName} aria-label="Alerts">
        <BellRing className="h-4.5 w-4.5" />
        {alertCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[var(--ats-danger)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {alertCount}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-12 z-50 w-[25rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-[1.35rem] border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] shadow-[var(--ats-shadow-md)] ring-1 ring-[rgb(255_255_255_/_0.45)]"
          >
            <div className="border-b border-[var(--ats-border)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--ats-primary)_10%,var(--ats-bg-elevated)),var(--ats-bg-elevated))] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">
                    Notification center
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[var(--ats-text)]">
                    {alertCount > 0 ? `${alertCount} active alerts` : "All clear"}
                  </div>
                </div>
                {loading ? <Loader2 className="h-4 w-4 animate-spin text-[var(--ats-text-soft)]" /> : null}
              </div>
            </div>

            <div className="max-h-[26rem] overflow-y-auto p-3">
              {visibleAlerts.length === 0 && !loading ? (
                <div className="rounded-2xl border border-dashed border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-4 py-6 text-center">
                  <div className="text-sm font-semibold text-[var(--ats-text)]">No active alerts</div>
                  <div className="mt-1 text-xs text-[var(--ats-text-muted)]">
                    Delivery exceptions, public applications, and reminders will appear here.
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {visibleAlerts.map((alert) => {
                      const rowId = normalizeAlertId(alert.id);
                      const busy = rowId != null && dismissingIds.includes(rowId);
                      return (
                        <motion.div
                          key={rowId ?? String(alert.message)}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.18 }}
                          className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-3 shadow-[var(--ats-shadow-sm)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${toneForType(alert.type)}`}
                                >
                                  {String(alert.type || "alert").replaceAll("_", " ")}
                                </span>
                                <span className="text-[11px] text-[var(--ats-text-soft)]">{formatTime(alert.created_at)}</span>
                              </div>
                              <div className="mt-2 text-sm font-medium leading-6 text-[var(--ats-text)]">{alert.message}</div>
                              {alert.candidate_id != null && alert.candidate_id > 0 ? (
                                <div className="mt-3">
                                  <Link
                                    href={`/candidates/${alert.candidate_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 rounded-full border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--ats-primary)] transition hover:border-[color:rgb(37_99_235_/_0.24)] hover:bg-[color:rgb(37_99_235_/_0.08)]"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Open profile
                                    <ExternalLink className="h-3 w-3" />
                                  </Link>
                                </div>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleRemove(alert.id);
                              }}
                              disabled={busy}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] text-[var(--ats-text-muted)] transition hover:border-[var(--ats-border-strong)] hover:bg-[var(--ats-bg-panel-strong)] hover:text-[var(--ats-text)] disabled:opacity-50"
                              title="Dismiss alert"
                              aria-label="Dismiss alert"
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
