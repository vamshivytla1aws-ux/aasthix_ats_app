"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Calendar as CalendarIcon, Download, EyeOff, SlidersHorizontal, UserX, XCircle } from "lucide-react";
import { Calendar, Views } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { useDensity } from "@/lib/useDensity";
import DensityToggle from "@/components/ui/DensityToggle";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import RowActionsMenu from "@/components/enterprise/RowActionsMenu";
import StatusBadge from "@/components/enterprise/StatusBadge";
import FilterDrawer from "@/components/enterprise/FilterDrawer";
import Toast from "@/components/Toast";
import "react-big-calendar/lib/css/react-big-calendar.css";

const INTERVIEWS_LIST_KEY = "/api/applications?stage=Interview";
const INTERVIEW_ALERTS_KEY = "/api/interviews/alerts";

type JobOption = { id: number; title: string; company?: string | null };

type ApplicationRow = {
  id: number;
  stage: "Interview";
  candidate_id?: number;
  job_id?: number;
  candidate_full_name: string;
  job_title: string;
  job_company?: string | null;
  interview_scheduled?: boolean | null;
  interview_datetime?: string | null;
  interview_reschedule_reason?: string | null;
  interview_cancel_reason?: string | null;
  interview_no_show?: boolean | null;
  reminder_sent?: boolean | null;
};

type InterviewAlert = {
  id: number;
  type: "ongoing" | "upcoming";
  candidate_full_name: string;
  job_title: string;
  interview_datetime: string | null;
  message: string;
};

type CandidatePacketResponse = {
  candidate?: {
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    resume_url?: string | null;
    skills?: string | null;
  };
  notes?: Array<{ id: number; note: string }>;
};

type ChecklistResponse = {
  checklist?: Array<{ question_id: number; question: string; asked: boolean; notes?: string | null }>;
};

const locales = {
  "en-US": require("date-fns/locale/en-US"),
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const DnDCalendar = withDragAndDrop(Calendar);

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleString();
  }
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

function getSlaBadge(value: string | null | undefined) {
  if (!value) {
    return { label: "No slot", className: "bg-slate-100 text-slate-600 ring-slate-200" };
  }
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) {
    return { label: "Unknown", className: "bg-slate-100 text-slate-600 ring-slate-200" };
  }
  const diffMins = Math.floor((t - Date.now()) / (60 * 1000));
  if (diffMins < 0) {
    return { label: `Overdue ${Math.abs(diffMins)}m`, className: "bg-rose-50 text-rose-700 ring-rose-200" };
  }
  if (diffMins <= 120) {
    return { label: `Due in ${diffMins}m`, className: "bg-amber-50 text-amber-700 ring-amber-200" };
  }
  return { label: "On track", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" };
}

export default function InterviewsPage() {
  const { density, setDensity } = useDensity("ats:interviews-density", "compact");
  const {
    data: rows = [],
    error: interviewsFetchError,
    isLoading: interviewsLoading,
    mutate: mutateInterviews,
  } = useSWR<ApplicationRow[]>(INTERVIEWS_LIST_KEY, dashboardFetcher, {
    refreshInterval: 60_000,
  });
  const {
    data: alertsData,
    error: alertsFetchError,
    mutate: mutateAlerts,
  } = useSWR<{ alerts: InterviewAlert[] }>(INTERVIEW_ALERTS_KEY, dashboardFetcher, {
    refreshInterval: 60_000,
  });
  const { data: jobsForFilter = [] } = useSWR<JobOption[]>("/api/jobs", dashboardFetcher);
  const alerts = useMemo(() => alertsData?.alerts ?? [], [alertsData]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [filterDrawer, setFilterDrawer] = useState(false);
  const [drawerJobId, setDrawerJobId] = useState("");
  const [drawerDateFrom, setDrawerDateFrom] = useState("");
  const [drawerDateTo, setDrawerDateTo] = useState("");
  const [drawerSchedule, setDrawerSchedule] = useState<"all" | "scheduled" | "unscheduled">("all");
  const [drawerOverdueOnly, setDrawerOverdueOnly] = useState(false);
  const [view, setView] = useState<"table" | "calendar">("table");
  const [calendarBusy, setCalendarBusy] = useState<number | null>(null);
  const [calendarView, setCalendarView] = useState<any>(Views.WEEK);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedInterview, setSelectedInterview] = useState<ApplicationRow | null>(null);

  const [actionBusyId, setActionBusyId] = useState<number | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleSendEmail, setRescheduleSendEmail] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [debouncedSearchQ, setDebouncedSearchQ] = useState("");
  const [tableViewPreset, setTableViewPreset] = useState<"all" | "scheduled" | "upcoming" | "today" | "this_week" | "overdue">("all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [packetLoading, setPacketLoading] = useState(false);
  const [packet, setPacket] = useState<CandidatePacketResponse | null>(null);
  const [checklist, setChecklist] = useState<ChecklistResponse["checklist"]>([]);
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [columns, setColumns] = useState({
    candidate: true,
    jobTitle: true,
    company: true,
    scheduled: true,
    dateTime: true,
    actions: true,
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearchQ(searchQ.trim()), 280);
    return () => window.clearTimeout(t);
  }, [searchQ]);

  function showPermissionToast(err: unknown) {
    const status = err instanceof ApiError ? err.status : (err as { status?: number })?.status;
    const msg = err instanceof ApiError ? err.message : (err as Error)?.message || "Request failed";
    if (status === 403) {
      setToast({
        message: `${msg} You may need pipeline.manage or interviews access.`,
        variant: "error",
      });
    }
  }

  function showSuccessToast(message: string) {
    setToast({ message, variant: "success" });
  }

  const ongoingAlerts = useMemo(
    () => alerts.filter((a) => a.type === "ongoing"),
    [alerts]
  );

  const upcomingAlerts = useMemo(
    () => alerts.filter((a) => a.type === "upcoming"),
    [alerts]
  );

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const ta = a.interview_datetime ? new Date(a.interview_datetime).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.interview_datetime ? new Date(b.interview_datetime).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    });
    return copy;
  }, [rows]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("ats:interviews-columns");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setColumns((prev) => ({ ...prev, ...parsed }));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("ats:interviews-columns", JSON.stringify(columns));
    } catch {
      // ignore
    }
  }, [columns]);

  const tableRows = useMemo(() => {
    if (tableViewPreset === "all") return sorted;
    if (tableViewPreset === "scheduled") {
      return sorted.filter((r) => Boolean(r.interview_scheduled && r.interview_datetime));
    }
    const now = new Date();
    const nowMs = now.getTime();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const weekEnd = dayStart + 7 * 24 * 60 * 60 * 1000;
    if (tableViewPreset === "today") {
      return sorted.filter((r) => {
        if (!r.interview_datetime || !r.interview_scheduled) return false;
        const t = new Date(r.interview_datetime).getTime();
        return Number.isFinite(t) && t >= dayStart && t < dayEnd;
      });
    }
    if (tableViewPreset === "this_week") {
      return sorted.filter((r) => {
        if (!r.interview_datetime || !r.interview_scheduled) return false;
        const t = new Date(r.interview_datetime).getTime();
        return Number.isFinite(t) && t >= dayStart && t < weekEnd;
      });
    }
    if (tableViewPreset === "overdue") {
      return sorted.filter((r) => {
        if (!r.interview_datetime || !r.interview_scheduled) return false;
        const t = new Date(r.interview_datetime).getTime();
        return Number.isFinite(t) && t < nowMs;
      });
    }
    const oneHour = nowMs + 60 * 60 * 1000;
    return sorted.filter((r) => {
      if (!r.interview_datetime || !r.interview_scheduled) return false;
      const t = new Date(r.interview_datetime).getTime();
      return Number.isFinite(t) && t >= nowMs && t <= oneHour;
    });
  }, [sorted, tableViewPreset]);

  const drawerFilteredRows = useMemo(() => {
    let list = tableRows;
    const jobIdN = drawerJobId ? Number(drawerJobId) : NaN;
    if (Number.isFinite(jobIdN) && jobIdN > 0) {
      list = list.filter((r) => r.job_id === jobIdN);
    }
    if (drawerSchedule === "scheduled") {
      list = list.filter((r) => Boolean(r.interview_scheduled && r.interview_datetime));
    } else if (drawerSchedule === "unscheduled") {
      list = list.filter((r) => !r.interview_scheduled || !r.interview_datetime);
    }
    if (drawerDateFrom) {
      const start = new Date(drawerDateFrom);
      start.setHours(0, 0, 0, 0);
      const startMs = start.getTime();
      list = list.filter((r) => {
        if (!r.interview_datetime) return false;
        const t = new Date(r.interview_datetime).getTime();
        return Number.isFinite(t) && t >= startMs;
      });
    }
    if (drawerDateTo) {
      const end = new Date(drawerDateTo);
      end.setHours(23, 59, 59, 999);
      const endMs = end.getTime();
      list = list.filter((r) => {
        if (!r.interview_datetime) return false;
        const t = new Date(r.interview_datetime).getTime();
        return Number.isFinite(t) && t <= endMs;
      });
    }
    if (drawerOverdueOnly) {
      const nowMs = Date.now();
      list = list.filter((r) => {
        if (!r.interview_datetime || !r.interview_scheduled) return false;
        const t = new Date(r.interview_datetime).getTime();
        return Number.isFinite(t) && t < nowMs;
      });
    }
    return list;
  }, [tableRows, drawerJobId, drawerSchedule, drawerDateFrom, drawerDateTo, drawerOverdueOnly]);

  const filteredTableRows = useMemo(() => {
    const q = debouncedSearchQ.toLowerCase();
    if (!q) return drawerFilteredRows;
    return drawerFilteredRows.filter((r) =>
      [r.candidate_full_name, r.job_title, r.job_company || ""].join(" ").toLowerCase().includes(q)
    );
  }, [drawerFilteredRows, debouncedSearchQ]);
  const rowPadClass =
    density === "comfortable" ? "px-4 py-4" : density === "compact" ? "px-4 py-3.5" : "px-4 py-2.5";
  const kpis = useMemo(() => {
    const total = rows.length;
    const scheduled = rows.filter((r) => Boolean(r.interview_scheduled)).length;
    const now = Date.now();
    const oneHour = now + 60 * 60 * 1000;
    const upcoming = rows.filter((r) => {
      if (!r.interview_datetime || !r.interview_scheduled) return false;
      const t = new Date(r.interview_datetime).getTime();
      return Number.isFinite(t) && t >= now && t <= oneHour;
    }).length;
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const endToday = startToday.getTime() + 24 * 60 * 60 * 1000;
    const endWeek = startToday.getTime() + 7 * 24 * 60 * 60 * 1000;
    const todayScheduled = rows.filter((r) => {
      if (!r.interview_datetime || !r.interview_scheduled) return false;
      const t = new Date(r.interview_datetime).getTime();
      return Number.isFinite(t) && t >= startToday.getTime() && t < endToday;
    }).length;
    const weekScheduled = rows.filter((r) => {
      if (!r.interview_datetime || !r.interview_scheduled) return false;
      const t = new Date(r.interview_datetime).getTime();
      return Number.isFinite(t) && t >= startToday.getTime() && t < endWeek;
    }).length;
    return { total, scheduled, upcoming, todayScheduled, weekScheduled };
  }, [rows]);

  function exportCsv() {
    const headers: string[] = [];
    if (columns.candidate) headers.push("Candidate");
    if (columns.jobTitle) headers.push("Job Title");
    if (columns.company) headers.push("Company");
    if (columns.scheduled) headers.push("Interview Scheduled");
    if (columns.dateTime) headers.push("Interview DateTime");
    const lines = [headers.join(",")];
    for (const r of filteredTableRows) {
      const row: string[] = [];
      if (columns.candidate) row.push(r.candidate_full_name || "");
      if (columns.jobTitle) row.push(r.job_title || "");
      if (columns.company) row.push(r.job_company || "");
      if (columns.scheduled) row.push(r.interview_scheduled ? "Scheduled" : "Not scheduled");
      if (columns.dateTime) row.push(formatDateTime(r.interview_datetime));
      lines.push(row.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","));
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `interviews-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const events = useMemo(() => {
    return rows
      .filter((r) => r.interview_datetime && r.interview_scheduled)
      .map((r) => {
        const start = new Date(r.interview_datetime as string);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        return {
          title: `${r.candidate_full_name} — ${r.job_title}`,
          start,
          end,
          allDay: false,
          resource: r,
        };
      });
  }, [rows]);

  const today = new Date();

  function getLocalDateTimeInputs(iso?: string | null) {
    const base = iso ? new Date(iso) : new Date();
    // Round to next 30-min slot for better UX.
    base.setMinutes(Math.ceil(base.getMinutes() / 30) * 30);
    base.setSeconds(0);
    base.setMilliseconds(0);

    const date = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
    const time = `${String(base.getHours()).padStart(2, "0")}:${String(base.getMinutes()).padStart(2, "0")}`;
    return { date, time };
  }

  async function fetchPacketData(app: ApplicationRow) {
    if (!app.id) return;
    setPacketLoading(true);
    setPacket(null);
    setChecklist([]);
    try {
      if (app.candidate_id) {
        try {
          const candidate = await apiFetchJson<CandidatePacketResponse>(`/api/candidates/${app.candidate_id}`);
          setPacket(candidate);
        } catch {
          // keep drawer functional without candidate profile permission
        }
      }
      try {
        const checklistData = await apiFetchJson<ChecklistResponse>(`/api/applications/${app.id}/interview-checklist`);
        setChecklist(checklistData.checklist || []);
      } catch {
        setChecklist([]);
      }
    } finally {
      setPacketLoading(false);
    }
  }

  async function handleEventDrop(args: any) {
    const event = args?.event as any;
    const start = args?.start as string | Date | undefined;
    if (!event || !start) return;

    const appId: number | undefined = (event.resource as ApplicationRow | undefined)?.id;
    if (!appId) return;
    if (calendarBusy !== null) return;

    const newIso = new Date(start as any).toISOString();
    setCalendarBusy(appId);
    setError(null);
    try {
      const updated = await apiFetchJson<ApplicationRow>("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: appId,
          interview_datetime: newIso,
          reminder_sent: false,
          send_email: false,
        }),
      });

      await mutateInterviews(
        (prev) => (prev ?? []).map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
        { revalidate: false }
      );
      showSuccessToast("Interview time updated.");
      void mutateAlerts();
    } catch (err: any) {
      showPermissionToast(err);
      setError(err.message || "Failed to update interview time");
    } finally {
      setCalendarBusy(null);
    }
  }

  async function updateInterviewInState(updated: ApplicationRow) {
    await mutateInterviews(
      (prev) => (prev ?? []).map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
      { revalidate: false }
    );
    setSelectedInterview((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  }

  async function submitReschedule() {
    if (!selectedInterview) return;
    if (!rescheduleDate || !rescheduleTime) {
      setError("Please select date and time.");
      return;
    }
    setError(null);
    setActionBusyId(selectedInterview.id);
    try {
      const iso = new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString();
      const updated = await apiFetchJson<ApplicationRow>("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedInterview.id,
          stage: "Interview",
          interview_scheduled: true,
          interview_datetime: iso,
          interview_reschedule_reason: rescheduleReason.trim() || null,
          interview_cancel_reason: "",
          interview_no_show: false,
          reminder_sent: false,
          send_email: rescheduleSendEmail,
        }),
      });
      await updateInterviewInState(updated);
      setRescheduleOpen(false);
      setDetailsOpen(false);
      setRescheduleReason("");
      setRescheduleSendEmail(false);
      showSuccessToast(rescheduleSendEmail ? "Interview rescheduled and candidate email sent." : "Interview rescheduled.");
      void mutateAlerts();
    } catch (err: any) {
      showPermissionToast(err);
      setError(err.message || "Failed to reschedule interview");
    } finally {
      setActionBusyId(null);
    }
  }

  async function cancelInterview(app: ApplicationRow) {
    setError(null);
    setActionBusyId(app.id);
    try {
      const updated = await apiFetchJson<ApplicationRow>("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: app.id,
          interview_scheduled: false,
          interview_cancel_reason: cancelReason.trim() || "Cancelled by recruiter",
          interview_no_show: false,
          reminder_sent: false,
        }),
      });
      await updateInterviewInState(updated);
      setDetailsOpen(false);
      setRescheduleOpen(false);
      setCancelReason("");
      showSuccessToast("Interview cancelled.");
      void mutateAlerts();
    } catch (err: any) {
      showPermissionToast(err);
      setError(err.message || "Failed to cancel interview");
    } finally {
      setActionBusyId(null);
    }
  }

  function openDetailsFor(app: ApplicationRow) {
    setSelectedInterview(app);
    setCancelReason(app.interview_cancel_reason || "");
    setDetailsOpen(true);
    setError(null);
    void fetchPacketData(app);
  }

  function openRescheduleFor(app: ApplicationRow) {
    setSelectedInterview(app);
    const { date, time } = getLocalDateTimeInputs(app.interview_datetime);
    setRescheduleDate(date);
    setRescheduleTime(time);
    setRescheduleSendEmail(false);
    setRescheduleReason(app.interview_reschedule_reason || "");
    setError(null);
    setRescheduleOpen(true);
  }

  async function markNoShow(app: ApplicationRow) {
    setError(null);
    setActionBusyId(app.id);
    try {
      const updated = await apiFetchJson<ApplicationRow>("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: app.id,
          interview_no_show: true,
          reminder_sent: false,
        }),
      });
      await updateInterviewInState(updated);
      setDetailsOpen(false);
      showSuccessToast("Marked as no-show.");
      void mutateAlerts();
    } catch (err: any) {
      showPermissionToast(err);
      setError(err.message || "Failed to mark no-show");
    } finally {
      setActionBusyId(null);
    }
  }

  async function runBulkAction(kind: "cancel" | "no_show" | "reset_reminder") {
    if (selectedIds.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    setError(null);
    const bulkCount = selectedIds.length;
    try {
      for (const id of selectedIds) {
        const payload: Record<string, unknown> = { id };
        if (kind === "cancel") {
          payload.interview_scheduled = false;
          payload.interview_cancel_reason = bulkReason.trim() || "Bulk cancel by recruiter";
          payload.interview_no_show = false;
          payload.reminder_sent = false;
        } else if (kind === "no_show") {
          payload.interview_no_show = true;
        } else {
          payload.reminder_sent = false;
        }
        const updated = await apiFetchJson<ApplicationRow>("/api/applications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await updateInterviewInState(updated);
      }
      setSelectedIds([]);
      setBulkReason("");
      const msg =
        kind === "cancel"
          ? `Bulk cancel applied to ${bulkCount} row(s).`
          : kind === "no_show"
            ? `Marked ${bulkCount} row(s) as no-show.`
            : `Reset reminder on ${bulkCount} row(s).`;
      showSuccessToast(msg);
      void mutateAlerts();
    } catch (err: any) {
      showPermissionToast(err);
      setError(err.message || "Failed bulk update");
      await mutateInterviews(undefined, { revalidate: true });
    } finally {
      setBulkBusy(false);
    }
  }

  const listLoadError = interviewsFetchError ? (interviewsFetchError as Error).message : null;
  const showInitialSkeleton = interviewsLoading && rows.length === 0;

  return (
    <AccessGate permissionKey="interviews.view">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={4000} /> : null}
      <FilterDrawer
        open={filterDrawer}
        onClose={() => setFilterDrawer(false)}
        title="Interview filters"
        onApply={() => setFilterDrawer(false)}
        onReset={() => {
          setDrawerJobId("");
          setDrawerDateFrom("");
          setDrawerDateTo("");
          setDrawerSchedule("all");
          setDrawerOverdueOnly(false);
          setFilterDrawer(false);
        }}
      >
        <div className="space-y-4 text-sm">
          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Job</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              value={drawerJobId}
              onChange={(e) => setDrawerJobId(e.target.value)}
            >
              <option value="">All jobs</option>
              {jobsForFilter.map((j) => (
                <option key={j.id} value={String(j.id)}>
                  {j.title}
                  {j.company ? ` — ${j.company}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Schedule status</label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              value={drawerSchedule}
              onChange={(e) => setDrawerSchedule(e.target.value as typeof drawerSchedule)}
            >
              <option value="all">All</option>
              <option value="scheduled">Scheduled (with slot)</option>
              <option value="unscheduled">Not scheduled / no slot</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">From date</label>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                value={drawerDateFrom}
                onChange={(e) => setDrawerDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-700 dark:text-slate-300">To date</label>
              <input
                type="date"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
                value={drawerDateTo}
                onChange={(e) => setDrawerDateTo(e.target.value)}
              />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={drawerOverdueOnly} onChange={(e) => setDrawerOverdueOnly(e.target.checked)} />
            <span className="text-slate-700 dark:text-slate-300">Overdue only (past slot, still marked scheduled)</span>
          </label>
        </div>
      </FilterDrawer>
      <ModulePageFrame
        title="Interviews"
        subtitle="Schedules, SLA badges, table & calendar — monitor and act in one workspace."
        metrics={
          listLoadError ? (
            <span className="text-red-600 dark:text-red-400">{listLoadError}</span>
          ) : interviewsLoading && rows.length === 0 ? (
            <span className="text-slate-500 dark:text-slate-400">Loading interview queue…</span>
          ) : (
            <span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{rows.length}</span> in Interview stage
              {drawerFilteredRows.length !== tableRows.length ? (
                <span className="text-slate-500 dark:text-slate-400">
                  {" "}
                  · <span className="font-semibold text-slate-700 dark:text-slate-300">{drawerFilteredRows.length}</span> after drawer filters
                </span>
              ) : null}
            </span>
          )
        }
        banner={
          alertsFetchError ? (
            <div className="flex flex-col gap-2 text-sm text-amber-900 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Live alerts could not be loaded:{" "}
                <span className="font-medium">{(alertsFetchError as Error).message || "Unknown error"}</span>. The interview list is still available.
              </span>
              <button
                type="button"
                className={UI.secondaryButton + " shrink-0 py-1.5 text-xs"}
                onClick={() => void mutateAlerts()}
              >
                Retry alerts
              </button>
            </div>
          ) : null
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/pipeline?stage=Interview"
              className={UI.secondaryButton + " inline-flex items-center gap-1 py-2 text-xs no-underline"}
            >
              Pipeline
            </Link>
            <button
              type="button"
              onClick={() => setFilterDrawer(true)}
              className={UI.secondaryButton + " py-2 text-xs"}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
            </button>
            <DensityToggle density={density} onChange={setDensity} />
            <button
              type="button"
              onClick={() => {
                void mutateInterviews();
                void mutateAlerts();
              }}
              className={UI.secondaryButton + " py-2 text-xs"}
            >
              Refresh
            </button>
          </div>
        }
      >
      <div className="space-y-4">
      {ongoingAlerts.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
          <div className="font-semibold">Interview in progress: {ongoingAlerts[0].candidate_full_name}</div>
        </div>
      )}

      {upcomingAlerts.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <div className="font-semibold">
            {upcomingAlerts.length} interview(s) scheduled within 1 hour
          </div>
          <div className="mt-2 space-y-1 text-sm">
            {upcomingAlerts.slice(0, 3).map((a) => (
              <div key={`upcoming-${a.id}`} className="text-amber-900">
                - {a.candidate_full_name} - {formatTime(a.interview_datetime)}
              </div>
            ))}
            {upcomingAlerts.length > 3 && (
              <div className="font-medium text-amber-800">+{upcomingAlerts.length - 3} more...</div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Interviews</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{kpis.total}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Scheduled</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{kpis.scheduled}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upcoming (1h)</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{kpis.upcoming}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{kpis.todayScheduled}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">This Week</div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{kpis.weekScheduled}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={() => setView("table")}
          className={[
            "px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            view === "table" ? "bg-indigo-600 text-white" : "bg-white text-slate-700 border hover:bg-gray-50",
          ].join(" ")}
        >
          Table View
        </button>
        <button
          type="button"
          onClick={() => setView("calendar")}
          className={[
            "px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
            view === "calendar" ? "bg-indigo-600 text-white" : "bg-white text-slate-700 border hover:bg-gray-50",
          ].join(" ")}
        >
          Calendar View
        </button>

        {view === "calendar" && (
          <>
            <button
              type="button"
              onClick={() => setCalendarView(Views.DAY)}
              className={[
                "px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                calendarView === Views.DAY ? "bg-indigo-600 text-white" : "bg-white text-slate-700 border hover:bg-gray-50",
              ].join(" ")}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setCalendarView(Views.WEEK)}
              className={[
                "px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                calendarView === Views.WEEK ? "bg-indigo-600 text-white" : "bg-white text-slate-700 border hover:bg-gray-50",
              ].join(" ")}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setCalendarView(Views.MONTH)}
              className={[
                "px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
                calendarView === Views.MONTH ? "bg-indigo-600 text-white" : "bg-white text-slate-700 border hover:bg-gray-50",
              ].join(" ")}
            >
              Month
            </button>
          </>
        )}
        {view === "table" && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search candidate/job/company..."
              className="min-w-[220px] rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setTableViewPreset("all")}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                tableViewPreset === "all" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              ].join(" ")}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setTableViewPreset("scheduled")}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                tableViewPreset === "scheduled"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              ].join(" ")}
            >
              Scheduled
            </button>
            <button
              type="button"
              onClick={() => setTableViewPreset("upcoming")}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                tableViewPreset === "upcoming"
                  ? "bg-amber-50 text-amber-700"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              ].join(" ")}
            >
              Upcoming 1h
            </button>
            <button
              type="button"
              onClick={() => setTableViewPreset("today")}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                tableViewPreset === "today" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              ].join(" ")}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setTableViewPreset("this_week")}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                tableViewPreset === "this_week" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              ].join(" ")}
            >
              This Week
            </button>
            <button
              type="button"
              onClick={() => setTableViewPreset("overdue")}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                tableViewPreset === "overdue" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              ].join(" ")}
            >
              Overdue
            </button>
            <div className="relative">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={exportCsv}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-gray-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </button>
                <button
                  type="button"
                  onClick={() => setShowColumnsMenu((p) => !p)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-gray-50"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Columns
                </button>
              </div>
              {showColumnsMenu ? (
                <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
                  {(
                    [
                      ["candidate", "Candidate"],
                      ["jobTitle", "Job Title"],
                      ["company", "Company"],
                      ["scheduled", "Scheduled"],
                      ["dateTime", "Date Time"],
                      ["actions", "Actions"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={columns[key]}
                        onChange={(e) => setColumns((prev) => ({ ...prev, [key]: e.target.checked }))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {view === "table" && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-xs font-semibold text-slate-700">{selectedIds.length} selected</div>
          <input
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            placeholder="Reason (for bulk cancel)"
            className="min-w-[240px] rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => runBulkAction("cancel")}
            disabled={selectedIds.length === 0 || bulkBusy}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
          >
            {bulkBusy ? "Working..." : "Bulk Cancel"}
          </button>
          <button
            type="button"
            onClick={() => runBulkAction("no_show")}
            disabled={selectedIds.length === 0 || bulkBusy}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-50"
          >
            Mark No-show
          </button>
          <button
            type="button"
            onClick={() => runBulkAction("reset_reminder")}
            disabled={selectedIds.length === 0 || bulkBusy}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
          >
            Reset Reminder
          </button>
        </div>
      )}

      {listLoadError && rows.length === 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-6 text-center shadow-sm dark:border-rose-900 dark:bg-rose-950/40">
          <div className="text-base font-semibold text-rose-900 dark:text-rose-100">Unable to load interviews</div>
          <p className="mt-1 text-sm text-rose-800 dark:text-rose-200">{listLoadError}</p>
          <button
            type="button"
            className={UI.secondaryButton + " mt-4 py-2 text-xs"}
            onClick={() => void mutateInterviews()}
          >
            Retry
          </button>
        </div>
      ) : showInitialSkeleton ? (
        <div className="rounded-2xl border bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="h-4 w-32 rounded bg-slate-200 animate-pulse dark:bg-slate-700" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 rounded bg-slate-100 animate-pulse dark:bg-slate-800" />
            ))}
          </div>
        </div>
      ) : filteredTableRows.length === 0 && view === "table" ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-600 dark:bg-slate-900/50">
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {rows.length === 0 ? "No interviews" : "No rows match filters"}
          </div>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {rows.length === 0
              ? "Move candidates to the Interview stage on the Pipeline board to see them here."
              : "Adjust table presets, drawer filters, or search to see more rows."}
          </div>
        </div>
      ) : view === "table" ? (
        <div className="max-h-[min(70vh,36rem)] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
            <thead>
              <tr>
                <th className="sticky top-0 z-20 bg-slate-50 px-4 py-2 shadow-[0_1px_0_0_rgb(226_232_240)] dark:bg-slate-900 dark:shadow-[0_1px_0_0_rgb(51_65_85)]">
                  <input
                    type="checkbox"
                    checked={filteredTableRows.length > 0 && selectedIds.length === filteredTableRows.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? filteredTableRows.map((x) => x.id) : [])}
                  />
                </th>
                {columns.candidate ? <th className="sticky top-0 z-20 bg-slate-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)] dark:bg-slate-900 dark:text-slate-400 dark:shadow-[0_1px_0_0_rgb(51_65_85)]">
                  Candidate name
                </th> : null}
                {columns.jobTitle ? <th className="sticky top-0 z-20 bg-slate-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)] dark:bg-slate-900 dark:text-slate-400 dark:shadow-[0_1px_0_0_rgb(51_65_85)]">
                  Job title
                </th> : null}
                {columns.company ? <th className="sticky top-0 z-20 bg-slate-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)] dark:bg-slate-900 dark:text-slate-400 dark:shadow-[0_1px_0_0_rgb(51_65_85)]">
                  Company
                </th> : null}
                {columns.scheduled ? <th className="sticky top-0 z-20 bg-slate-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)] dark:bg-slate-900 dark:text-slate-400 dark:shadow-[0_1px_0_0_rgb(51_65_85)]">
                  Interview Scheduled
                </th> : null}
                {columns.dateTime ? <th className="sticky top-0 z-20 bg-slate-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)] dark:bg-slate-900 dark:text-slate-400 dark:shadow-[0_1px_0_0_rgb(51_65_85)]">
                  Interview DateTime
                </th> : null}
                <th className="sticky top-0 z-20 bg-slate-50 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)] dark:bg-slate-900 dark:text-slate-400 dark:shadow-[0_1px_0_0_rgb(51_65_85)]">
                  SLA
                </th>
                {columns.actions ? <th className="sticky top-0 z-20 bg-slate-50 px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226_232_240)] dark:bg-slate-900 dark:text-slate-400 dark:shadow-[0_1px_0_0_rgb(51_65_85)]">
                  Actions
                </th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-[15px]">
              {filteredTableRows.map((r) => (
                <tr key={r.id} className="odd:bg-slate-50/50 hover:bg-slate-100/60 transition-colors">
                  <td className={rowPadClass}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(r.id)}
                      onChange={(e) =>
                        setSelectedIds((prev) =>
                          e.target.checked ? Array.from(new Set([...prev, r.id])) : prev.filter((x) => x !== r.id)
                        )
                      }
                    />
                  </td>
                  {columns.candidate ? (
                    <td className={[rowPadClass, "font-semibold text-slate-900"].join(" ")}>
                      {r.candidate_id ? (
                        <Link
                          href={`/candidates/${r.candidate_id}?application=${r.id}`}
                          className="text-indigo-700 hover:underline dark:text-indigo-400"
                        >
                          {r.candidate_full_name}
                        </Link>
                      ) : (
                        r.candidate_full_name
                      )}
                    </td>
                  ) : null}
                  {columns.jobTitle ? <td className={[rowPadClass, "text-slate-700"].join(" ")}>{r.job_title}</td> : null}
                  {columns.company ? <td className={[rowPadClass, "text-slate-700"].join(" ")}>{r.job_company ?? "—"}</td> : null}
                  {columns.scheduled ? <td className={[rowPadClass, "whitespace-nowrap"].join(" ")}>
                    <StatusBadge status={r.interview_scheduled ? "Scheduled" : "Not scheduled"} />
                  </td> : null}
                  {columns.dateTime ? <td className={[rowPadClass, "whitespace-nowrap text-slate-700"].join(" ")}>
                    {formatDateTime(r.interview_datetime)}
                  </td> : null}
                  <td className={[rowPadClass, "whitespace-nowrap"].join(" ")}>
                    {(() => {
                      const badge = getSlaBadge(r.interview_datetime);
                      return (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${badge.className}`}>
                          {badge.label}
                        </span>
                      );
                    })()}
                  </td>
                  {columns.actions ? <td className={[rowPadClass, "text-right whitespace-nowrap"].join(" ")}>
                    <div className={actionBusyId === r.id ? "pointer-events-none opacity-50" : ""}>
                      <RowActionsMenu
                        ariaLabel={`Actions for ${r.candidate_full_name}`}
                        items={[
                          {
                            type: "button",
                            label: "Reschedule",
                            icon: <CalendarIcon className="h-3.5 w-3.5" />,
                            onClick: () => openRescheduleFor(r),
                          },
                          ...(r.interview_scheduled
                            ? [
                                {
                                  type: "button" as const,
                                  label: "Cancel interview",
                                  icon: <XCircle className="h-3.5 w-3.5" />,
                                  danger: true as const,
                                  onClick: () => cancelInterview(r),
                                },
                              ]
                            : []),
                          {
                            type: "button",
                            label: "Mark no-show",
                            icon: <UserX className="h-3.5 w-3.5" />,
                            onClick: () => markNoShow(r),
                          },
                        ]}
                      />
                    </div>
                  </td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
          <DnDCalendar
            localizer={localizer}
            events={events}
            defaultView={Views.WEEK}
            view={calendarView}
            views={[Views.DAY, Views.WEEK, Views.MONTH]}
            toolbar={false}
            startAccessor={(e: any) => e.start}
            endAccessor={(e: any) => e.end}
            step={30}
            timeslots={2}
            style={{ height: 600 }}
            draggableAccessor={(event: any) => {
              const r = event?.resource as ApplicationRow | undefined;
              return !!r?.interview_datetime && !!r?.interview_scheduled;
            }}
            eventPropGetter={(event: any) => {
              const r = event?.resource as ApplicationRow | undefined;
              let className = "bg-blue-600 border-blue-600 text-white";
              if (r?.interview_datetime) {
                const d = new Date(r.interview_datetime);
                const now = new Date();
                const pastWindow = d.getTime() >= now.getTime() - 60 * 60 * 1000 && d.getTime() <= now.getTime();
                const upcomingWindow = d.getTime() > now.getTime() && d.getTime() <= now.getTime() + 60 * 60 * 1000;
                const isToday =
                  d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();

                if (pastWindow) className = "bg-emerald-600 border-emerald-600 text-white";
                else if (upcomingWindow) className = "bg-amber-500 border-amber-500 text-white";
                else if (isToday) className = "bg-blue-500 border-blue-500 text-white";
              }
              return { className };
            }}
            onEventDrop={handleEventDrop}
            onSelectEvent={(event: any) => {
              const r = event?.resource as ApplicationRow | undefined;
              if (r) openDetailsFor(r);
            }}
          />
        </div>
      )}

      {detailsOpen && selectedInterview && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDetailsOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-md border border-slate-200 p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-lg font-semibold">{selectedInterview.candidate_full_name}</div>
                  <div className="mt-1 text-sm text-slate-600">{selectedInterview.job_title}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {selectedInterview.job_company ?? "—"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(false)}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition-all duration-200"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">Status</div>
                  <div className="mt-1">
                    {selectedInterview.interview_no_show ? (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                        No-show
                      </span>
                    ) : selectedInterview.interview_scheduled ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                        Scheduled
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        Not scheduled
                      </span>
                    )}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">Interview Date & Time</div>
                  <div className="mt-1 text-sm text-slate-700">{formatDateTime(selectedInterview.interview_datetime)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-900">Interview Packet</div>
                  {packetLoading ? (
                    <div className="mt-2 text-sm text-slate-600">Loading packet...</div>
                  ) : (
                    <div className="mt-2 space-y-2 text-sm text-slate-700">
                      <div>Email: {packet?.candidate?.email || "—"}</div>
                      <div>Phone: {packet?.candidate?.phone || "—"}</div>
                      <div>Location: {packet?.candidate?.location || "—"}</div>
                      <div>Skills: {packet?.candidate?.skills || "—"}</div>
                      <div>
                        Resume:{" "}
                        {packet?.candidate?.resume_url ? (
                          <a
                            href={packet.candidate.resume_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-blue-700 hover:text-blue-800"
                          >
                            Open resume
                          </a>
                        ) : (
                          "—"
                        )}
                      </div>
                      <div>Checklist questions: {checklist?.length || 0}</div>
                      <div>Questions asked: {checklist?.filter((x) => x.asked).length || 0}</div>
                      <div>Notes: {packet?.notes?.length || 0}</div>
                    </div>
                  )}
                </div>
                {(selectedInterview.interview_reschedule_reason || selectedInterview.interview_cancel_reason) && (
                  <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                    {selectedInterview.interview_reschedule_reason ? (
                      <div>Last reschedule reason: {selectedInterview.interview_reschedule_reason}</div>
                    ) : null}
                    {selectedInterview.interview_cancel_reason ? (
                      <div>Last cancel reason: {selectedInterview.interview_cancel_reason}</div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-xs font-semibold text-slate-600">Cancel reason</label>
                <input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Candidate unavailable / duplicate / role on hold..."
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDetailsOpen(false);
                    openRescheduleFor(selectedInterview);
                  }}
                  disabled={actionBusyId === selectedInterview.id}
                  className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 transition-all duration-200 disabled:opacity-50"
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  onClick={() => cancelInterview(selectedInterview)}
                  disabled={actionBusyId === selectedInterview.id || !selectedInterview.interview_scheduled}
                  className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 transition-all duration-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => markNoShow(selectedInterview)}
                  disabled={actionBusyId === selectedInterview.id}
                  className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50 transition-all duration-200 disabled:opacity-50"
                >
                  Mark No-show
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rescheduleOpen && selectedInterview && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setRescheduleOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-md border border-slate-200 p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-lg font-semibold">Reschedule Interview</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {selectedInterview.candidate_full_name} — {selectedInterview.job_title}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRescheduleOpen(false)}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition-all duration-200"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-sm text-gray-600">Date</label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    disabled={actionBusyId === selectedInterview.id}
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm text-gray-600">Time</label>
                  <input
                    type="time"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    disabled={actionBusyId === selectedInterview.id}
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-sm text-gray-600">Reschedule reason</label>
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  disabled={actionBusyId === selectedInterview.id}
                  placeholder="Panel unavailable / candidate request / conflict..."
                />
              </div>

              <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={rescheduleSendEmail}
                  onChange={(e) => setRescheduleSendEmail(e.target.checked)}
                  disabled={actionBusyId === selectedInterview.id}
                />
                Send email to candidate
              </label>

              <div className="mt-6">
                <button
                  type="button"
                  disabled={actionBusyId === selectedInterview.id}
                  onClick={submitReschedule}
                  className="w-full bg-blue-600 text-white rounded-xl px-4 py-2 hover:bg-blue-700 transition-all duration-200 disabled:opacity-50"
                >
                  {actionBusyId === selectedInterview.id ? "Rescheduling..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
      </ModulePageFrame>
    </AccessGate>
  );
}
