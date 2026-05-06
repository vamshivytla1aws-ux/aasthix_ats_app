"use client";

import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { Clock3, LogIn, LogOut, RefreshCw } from "lucide-react";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import StatusBadge from "@/components/enterprise/StatusBadge";

type AttendanceMeResponse = {
  today: string;
  active_session: boolean;
  record: {
    status: "present" | "late" | "absent";
    first_check_in_at: string | null;
    last_check_out_at: string | null;
    total_minutes: number;
  } | null;
  settings: {
    company_timezone: string;
    start_time_local: string;
    grace_minutes: number;
  };
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatMinutes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0h 0m";
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return `${hours}h ${mins}m`;
}

export default function DashboardAttendanceCard() {
  const { data, error, isLoading, mutate } = useSWR<AttendanceMeResponse>("/api/attendance/me", dashboardFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
  const [busy, setBusy] = useState<"checkin" | "checkout" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const derivedStatus = useMemo(() => {
    if (!data?.record) return "not checked in";
    return data.record.status.replace(/_/g, " ");
  }, [data]);

  async function runAction(kind: "checkin" | "checkout") {
    setBusy(kind);
    setMessage(null);
    try {
      await apiFetchJson(`/api/attendance/${kind === "checkin" ? "check-in" : "check-out"}`, { method: "POST" });
      setMessage(kind === "checkin" ? "Checked in for today." : "Checked out successfully.");
      void mutate();
    } catch (error) {
      const text = error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Attendance action failed.";
      setMessage(text);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={UI.enterprise.metricCard + " h-full"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">Attendance</div>
          <div className="mt-2 text-xl font-semibold text-[var(--ats-text)]">Today’s check-in desk</div>
          <div className="mt-1 text-sm text-[var(--ats-text-muted)]">
            {data?.settings.company_timezone || "Asia/Kolkata"} · Start {data?.settings.start_time_local || "09:30"}
          </div>
        </div>
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] text-[var(--ats-primary)]">
          <Clock3 className="h-6 w-6" />
        </div>
      </div>

      {isLoading && !data ? (
        <div className="mt-4 text-sm text-[var(--ats-text-muted)]">Loading attendance…</div>
      ) : error ? (
        <div className="mt-4 text-sm text-rose-600">Unable to load attendance right now.</div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2">
            <StatusBadge status={derivedStatus} />
            {data?.active_session ? <span className="text-xs text-[var(--ats-text-muted)]">Session active</span> : null}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ats-text-soft)]">Check in</div>
              <div className="mt-1 font-semibold text-[var(--ats-text)]">{formatDateTime(data?.record?.first_check_in_at)}</div>
            </div>
            <div className="rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ats-text-soft)]">Check out</div>
              <div className="mt-1 font-semibold text-[var(--ats-text)]">{formatDateTime(data?.record?.last_check_out_at)}</div>
            </div>
            <div className="rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ats-text-soft)]">Worked</div>
              <div className="mt-1 font-semibold text-[var(--ats-text)]">{formatMinutes(data?.record?.total_minutes ?? 0)}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runAction("checkin")}
              disabled={busy !== null || Boolean(data?.record?.first_check_in_at)}
              className={UI.primaryButton + " py-2 text-sm"}
            >
              <LogIn className="h-4 w-4" />
              {busy === "checkin" ? "Checking in…" : "Check in"}
            </button>
            <button
              type="button"
              onClick={() => void runAction("checkout")}
              disabled={busy !== null || !data?.record?.first_check_in_at || Boolean(data?.record?.last_check_out_at)}
              className={UI.secondaryButton + " py-2 text-sm"}
            >
              <LogOut className="h-4 w-4" />
              {busy === "checkout" ? "Checking out…" : "Check out"}
            </button>
            <button type="button" onClick={() => void mutate()} className={UI.secondaryButton + " py-2 text-sm"}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>

          {message ? <div className="mt-3 text-sm text-[var(--ats-text-muted)]">{message}</div> : null}
        </>
      )}
    </div>
  );
}
