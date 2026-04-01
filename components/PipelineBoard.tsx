"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { Calendar, ClipboardList } from "lucide-react";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import type { Density } from "@/lib/useDensity";
import StatusBadge from "@/components/enterprise/StatusBadge";
import RowActionsMenu, { type RowActionItem } from "@/components/enterprise/RowActionsMenu";
import Toast from "@/components/Toast";
import DispositionReasonModal from "@/components/DispositionReasonModal";

const STAGES = ["Applied", "Screening", "Screening Failed", "Interview", "Selected", "Rejected"] as const;
type Stage = (typeof STAGES)[number];

type ApplicationRow = {
  id: number;
  candidate_id: number;
  job_id: number;
  stage: Stage;
  updated_at: string;
  interview_scheduled?: boolean | null;
  interview_datetime?: string | null;
  candidate_full_name: string;
  job_title: string;
  reminder_sent?: boolean | null;
  job_company?: string | null;
  /** Accountable recruiter (owner) on the card */
  assigned_recruiter_user_id?: number | null;
  assigned_recruiter_name?: string | null;
  current_interview_round_order?: number | null;
  current_interview_round_label?: string | null;
  interview_round_total?: number | null;
  interview_round_status?: string | null;
  rejected_in_round_order?: number | null;
  selected_after_rounds?: number | null;
};
type ChecklistItem = {
  question_id: number;
  category: "technical" | "scenario" | "behavioral" | "hr";
  question: string;
  sort_order?: number;
  asked?: boolean;
  notes?: string | null;
};

type ScreeningTestSummary = {
  id: number;
  status: "pending" | "submitted" | "expired";
  expires_at: string;
  submitted_at: string | null;
  score: number | null;
  quality_flag: "high-quality" | "average" | "weak" | null;
};

function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

function nextStages(stage: Stage) {
  return STAGES.filter((s) => s !== stage);
}

/** Column subtitles — same pattern as the product roadmap board */
const STAGE_HINTS: Record<Stage, string> = {
  Applied: "New applications land here",
  Screening: "Initial qualification",
  Interview: "Active interview loop",
  Selected: "Offer / hire track",
  Rejected: "Closed for this role",
  "Screening Failed": "Needs recruiter review",
};

const stageStyles: Record<Stage, { headerBg: string; badgeBg: string; badgeText: string }> = {
  Applied: {
    headerBg: "bg-slate-100",
    badgeBg: "bg-slate-200/70",
    badgeText: "text-slate-900",
  },
  Screening: {
    headerBg: "bg-amber-100",
    badgeBg: "bg-amber-200/70",
    badgeText: "text-amber-900",
  },
  Interview: {
    headerBg: "bg-blue-100",
    badgeBg: "bg-blue-200/70",
    badgeText: "text-blue-900",
  },
  Selected: {
    headerBg: "bg-emerald-100",
    badgeBg: "bg-emerald-200/70",
    badgeText: "text-emerald-900",
  },
  Rejected: {
    headerBg: "bg-rose-100",
    badgeBg: "bg-rose-200/70",
    badgeText: "text-rose-900",
  },
  "Screening Failed": {
    headerBg: "bg-orange-100",
    badgeBg: "bg-orange-200/70",
    badgeText: "text-orange-900",
  },
};

export default function PipelineBoard({
  applications,
  onStageUpdated,
  onApplicationRemoved,
  canManage = true,
  density = "compact",
  recruiters = [],
  currentUserId,
}: {
  applications: ApplicationRow[];
  onStageUpdated: (updated: ApplicationRow) => void;
  /** After DELETE /api/applications/:id */
  onApplicationRemoved?: (applicationId: number) => void;
  canManage?: boolean;
  density?: Density;
  recruiters?: { id: number; full_name: string }[];
  currentUserId?: number;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [localApplications, setLocalApplications] = useState<ApplicationRow[]>(applications);
  const dragInFlightRef = useRef(false);
  const lastOptimisticMoveAtRef = useRef(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleApp, setScheduleApp] = useState<ApplicationRow | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  const [confirmScheduleOpen, setConfirmScheduleOpen] = useState(false);
  const [confirmScheduleIso, setConfirmScheduleIso] = useState<string>("");

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleApp, setRescheduleApp] = useState<ApplicationRow | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionApp, setDecisionApp] = useState<ApplicationRow | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [screeningByApplication, setScreeningByApplication] = useState<Record<number, ScreeningTestSummary | null>>({});
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [changeRecruiterApp, setChangeRecruiterApp] = useState<ApplicationRow | null>(null);
  const [changeRecruiterUserId, setChangeRecruiterUserId] = useState<string>("");
  const [removeConfirmApp, setRemoveConfirmApp] = useState<ApplicationRow | null>(null);
  const [pendingReject, setPendingReject] = useState<
    | { kind: "interview"; app: ApplicationRow }
    | { kind: "stage"; app: ApplicationRow }
    | { kind: "drag"; app: ApplicationRow }
    | null
  >(null);

  /** True from drag start until drag end — blocks prop sync that would break @hello-pangea/dnd mid-drag */
  const dragSessionRef = useRef(false);

  function notifyForbidden(err: unknown) {
    if (err instanceof ApiError && err.status === 403) {
      setToast({
        message: `${String(err.message)} — enable pipeline.manage (or admin) to update stages and interviews.`,
        variant: "error",
      });
      return true;
    }
    return false;
  }

  const dndDisabled =
    !canManage || busyId !== null || scheduleOpen || confirmScheduleOpen || rescheduleOpen || decisionOpen;
  const boardMinWidth = density === "comfortable" ? "min-w-[1200px]" : density === "compact" ? "min-w-[1100px]" : "min-w-[980px]";
  const columnPad = density === "comfortable" ? "p-4" : density === "compact" ? "p-3" : "p-2.5";
  const cardPad = density === "comfortable" ? "p-3.5" : density === "compact" ? "p-3" : "p-2.5";
  const columnGap = density === "comfortable" ? "gap-4" : density === "compact" ? "gap-3" : "gap-2.5";
  const cardGap = density === "comfortable" ? "space-y-3" : density === "compact" ? "space-y-2.5" : "space-y-2";
  const cardTitleClass = density === "ultra" ? "text-xs font-semibold text-slate-900 truncate" : "text-sm font-semibold text-slate-900 truncate";
  const cardSubClass = density === "ultra" ? "text-[11px] text-slate-600 truncate" : "text-xs text-slate-600 truncate";
  const WIP_LIMITS: Partial<Record<Stage, number>> = {
    Applied: 20,
    Screening: 12,
    Interview: 8,
    "Screening Failed": 10,
  };

  const grouped = useMemo(() => {
    const map: Record<Stage, ApplicationRow[]> = {
      Applied: [],
      Screening: [],
      Interview: [],
      "Screening Failed": [],
      Selected: [],
      Rejected: [],
    };
    for (const a of localApplications) {
      const stage = isStage(a.stage) ? a.stage : "Applied";
      map[stage].push(a);
    }
    return map;
  }, [localApplications]);

  // Keep local UI state in sync with parent updates.
  // Preserve very recent optimistic stage changes briefly to avoid snap-back while
  // parent state catches up after PATCH.
  useEffect(() => {
    if (dragSessionRef.current) return;
    if (dragInFlightRef.current) return;
    setLocalApplications((prev) => {
      const now = Date.now();
      const keepLocalStage = now - lastOptimisticMoveAtRef.current < 2000;
      const prevMap = new Map(prev.map((x) => [x.id, x]));
      const merged = applications.map((a) => {
        const local = prevMap.get(a.id);
        if (!local) return a;
        if (keepLocalStage && local.stage !== a.stage) {
          return { ...a, stage: local.stage };
        }
        return { ...local, ...a };
      });
      return merged;
    });
  }, [applications]);

  useEffect(() => {
    const target = localApplications.filter((x) => x.stage === "Screening" || x.stage === "Screening Failed");
    if (target.length === 0) {
      setScreeningByApplication({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<number, ScreeningTestSummary | null> = {};
      for (const row of target) {
        try {
          const res = await apiFetchJson<{ test: ScreeningTestSummary | null }>(
            `/api/screening-tests/by-application/${row.id}`
          );
          next[row.id] = res.test || null;
        } catch {
          next[row.id] = null;
        }
      }
      if (!cancelled) setScreeningByApplication(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [localApplications]);

  async function updateStage(id: number, stage: Stage) {
    if (!canManage) {
      setError("You need pipeline.manage permission to update stages.");
      return;
    }
    if (stage === "Rejected") {
      const app = localApplications.find((a) => a.id === id);
      if (app) setPendingReject({ kind: "stage", app });
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const updated = await apiFetchJson<ApplicationRow>("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, stage }),
      });
      onStageUpdated(updated);
    } catch (err: any) {
      if (!notifyForbidden(err)) {
        const status = typeof err?.status === "number" ? ` (${err.status})` : "";
        setError((err?.message || "Something went wrong") + status);
      }
    } finally {
      setBusyId(null);
    }
  }

  function openScheduleModal(app: ApplicationRow) {
    setError(null);
    setSuccess(null);
    setScheduleApp(app);
    setScheduleDate("");
    setScheduleTime("");
    setConfirmScheduleIso("");
    setConfirmScheduleOpen(false);
    setScheduleOpen(true);
    void loadChecklist(app.id);
  }

  async function loadChecklist(appId: number) {
    setChecklistLoading(true);
    try {
      const res = await apiFetchJson<{ checklist: ChecklistItem[] }>(`/api/applications/${appId}/interview-checklist`);
      setChecklist(Array.isArray(res?.checklist) ? res.checklist : []);
    } catch {
      setChecklist([]);
    } finally {
      setChecklistLoading(false);
    }
  }

  async function saveChecklist(appId: number) {
    setChecklistSaving(true);
    try {
      await apiFetchJson(`/api/applications/${appId}/interview-checklist`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checklist }),
      });
    } finally {
      setChecklistSaving(false);
    }
  }

  const handleDragStart = useCallback(() => {
    dragSessionRef.current = true;
  }, []);

  function parseApplicationDraggableId(draggableId: string): number | null {
    const m = /^app-(\d+)$/.exec(draggableId);
    if (m) return Number(m[1]);
    const n = Number(draggableId);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Must stay synchronous for @hello-pangea/dnd: the library does not await onDragEnd.
   * If we `async` + `await` here, React never commits before the drag finishes → card snaps back.
   * We flushSync the list update, then PATCH in the background.
   */
  function handleDragEnd(result: DropResult) {
    try {
      if (result.reason === "CANCEL") return;
      if (!canManage) {
        setError("You need pipeline.manage permission to move cards.");
        return;
      }

      const { destination, source, draggableId } = result;
      if (!destination) return;

      if (destination.droppableId === source.droppableId && destination.index === source.index) return;

      if (dndDisabled) return;

      const dest = destination.droppableId;
      const src = source.droppableId;

      if (!isStage(dest) || !isStage(src)) return;

      const sourceStage = src;
      const destStage = dest;

      const appId = parseApplicationDraggableId(draggableId);
      if (appId === null) return;

      // Same-column reorder (local only — not persisted to API)
      if (sourceStage === destStage) {
        const buckets: Record<Stage, ApplicationRow[]> = {
          Applied: [],
          Screening: [],
          Interview: [],
          "Screening Failed": [],
          Selected: [],
          Rejected: [],
        };
        for (const a of localApplications) {
          const s = isStage(a.stage) ? a.stage : "Applied";
          buckets[s].push(a);
        }
        const list = buckets[sourceStage];
        const fromIndex = list.findIndex((x) => x.id === appId);
        if (fromIndex < 0) return;
        const [moved] = list.splice(fromIndex, 1);
        if (!moved) return;
        list.splice(destination.index, 0, moved);
        const next = STAGES.flatMap((s) => buckets[s]);
        flushSync(() => setLocalApplications(next));
        return;
      }

      const app = localApplications.find((a) => a.id === appId);
      if (!app) return;

      if (app.stage === destStage) return;

      if (dndDisabled) return;

      if (destStage === "Rejected") {
        setPendingReject({ kind: "drag", app });
        return;
      }

      setError(null);
      setSuccess(null);

      const prevLocalApps = localApplications;
      const prevByStage: Record<Stage, ApplicationRow[]> = {
        Applied: [],
        Screening: [],
        Interview: [],
        "Screening Failed": [],
        Selected: [],
        Rejected: [],
      };
      for (const a of localApplications) {
        const s = isStage(a.stage) ? a.stage : "Applied";
        prevByStage[s].push(a);
      }

      const byStageIds: Record<Stage, number[]> = {
        Applied: prevByStage.Applied.map((x) => x.id),
        Screening: prevByStage.Screening.map((x) => x.id),
        Interview: prevByStage.Interview.map((x) => x.id),
        "Screening Failed": prevByStage["Screening Failed"].map((x) => x.id),
        Selected: prevByStage.Selected.map((x) => x.id),
        Rejected: prevByStage.Rejected.map((x) => x.id),
      };

      const fromIndex = byStageIds[sourceStage].findIndex((x) => x === appId);
      if (fromIndex < 0) return;
      byStageIds[sourceStage].splice(fromIndex, 1);
      byStageIds[destStage].splice(destination.index, 0, appId);

      const appMap = new Map(localApplications.map((x) => [x.id, x]));
      const movedApp: ApplicationRow = { ...appMap.get(appId)!, stage: destStage };

      const nextApps: ApplicationRow[] = STAGES.flatMap((s) =>
        byStageIds[s].map((id) => (id === appId ? movedApp : appMap.get(id)!))
      );

      dragInFlightRef.current = true;
      lastOptimisticMoveAtRef.current = Date.now();
      setBusyId(appId);

      flushSync(() => setLocalApplications(nextApps));

      void (async () => {
        try {
          const updated = await apiFetchJson<ApplicationRow>("/api/applications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: appId, stage: destStage }),
          });

          onStageUpdated(updated);
          setLocalApplications((prev) =>
            prev.map((row) => (row.id === updated.id ? { ...row, ...updated, stage: destStage } : row))
          );

          if (destStage === "Interview" && !app.interview_datetime) {
            setBusyId(null);
            openScheduleModal(updated);
          }
        } catch (err: any) {
          flushSync(() => setLocalApplications(prevLocalApps));
          if (!notifyForbidden(err)) {
            const status = typeof err?.status === "number" ? ` (${err.status})` : "";
            setError((err?.message || "Something went wrong") + status);
          }
        } finally {
          setBusyId(null);
          dragInFlightRef.current = false;
        }
      })();
    } finally {
      dragSessionRef.current = false;
    }
  }

  /** Prevent card drag when using action buttons (RBD / hello-pangea pattern) */
  function stopDragMouseDown(e: React.MouseEvent | React.TouchEvent | React.PointerEvent) {
    e.stopPropagation();
  }

  async function submitInterviewSchedule() {
    if (!scheduleApp) return;
    if (!scheduleDate || !scheduleTime) {
      setError("Please select interview date and time.");
      return;
    }
    const iso = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
    setSuccess(null);
    setConfirmScheduleIso(iso);
    setConfirmScheduleOpen(true);
  }

  async function confirmInterviewSchedule() {
    if (!scheduleApp) return;
    if (!confirmScheduleIso) return;

    setBusyId(scheduleApp.id);
    setError(null);
    setSuccess(null);
    try {
      const updated = await apiFetchJson<ApplicationRow>("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: scheduleApp.id,
          stage: "Interview",
          interview_scheduled: true,
          interview_datetime: confirmScheduleIso,
          send_email: true,
        }),
      });

      onStageUpdated(updated);
      await saveChecklist(scheduleApp.id);
      setSuccess("Email has sent successfully");
      setConfirmScheduleOpen(false);
      setScheduleOpen(false);
      setScheduleApp(null);
      setScheduleDate("");
      setScheduleTime("");
      setConfirmScheduleIso("");
    } catch (err: any) {
      if (!notifyForbidden(err)) setError(err.message || "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  function getLocalDateInputs(iso?: string | null) {
    if (!iso) return { date: "", time: "" };
    const d = new Date(iso);
    // Use local time so the value matches the user's date/time inputs.
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(
      2,
      "0"
    )}`;
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    return { date, time };
  }

  function openRescheduleModal(app: ApplicationRow) {
    const { date, time } = getLocalDateInputs(app.interview_datetime);
    setRescheduleApp(app);
    setRescheduleDate(date);
    setRescheduleTime(time);
    setRescheduleOpen(true);
    setError(null);
    void loadChecklist(app.id);
  }

  async function submitInterviewReschedule() {
    if (!rescheduleApp) return;
    if (!rescheduleDate || !rescheduleTime) {
      setError("Please select interview date and time.");
      return;
    }

    const iso = new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString();
    setBusyId(rescheduleApp.id);
    setError(null);
    try {
      const updated = await apiFetchJson<ApplicationRow>("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: rescheduleApp.id,
          interview_datetime: iso,
          reminder_sent: false,
          send_email: true,
        }),
      });

      onStageUpdated(updated);
      await saveChecklist(rescheduleApp.id);
      setRescheduleOpen(false);
      setRescheduleApp(null);
      setRescheduleDate("");
      setRescheduleTime("");
    } catch (err: any) {
      if (!notifyForbidden(err)) setError(err.message || "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  async function takeInterviewDecision(
    app: ApplicationRow,
    decision: "next_round" | "final_selected" | "rejected"
  ) {
    if (decision === "rejected") {
      setDecisionOpen(false);
      setDecisionApp(null);
      setPendingReject({ kind: "interview", app });
      return;
    }
    setBusyId(app.id);
    setError(null);
    setSuccess(null);
    try {
      const updated = await apiFetchJson<ApplicationRow>("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: app.id,
          interview_decision: decision,
          send_email: true,
        }),
      });
      onStageUpdated(updated);
      if (decision === "next_round") setSuccess("Moved to next round and notification sent.");
      if (decision === "final_selected") setSuccess("Candidate marked selected and moved from Interview.");
      setDecisionOpen(false);
      setDecisionApp(null);
    } catch (err: any) {
      if (!notifyForbidden(err)) setError(err.message || "Failed to update interview decision");
    } finally {
      setBusyId(null);
    }
  }

  /** Reject paths (menu → Rejected, drag → Rejected, interview decision) must always send disposition_reason_id — enforced by API and DispositionReasonModal. */
  async function submitRejectDisposition(reasonId: number) {
    if (!pendingReject) return;
    if (!Number.isFinite(reasonId) || reasonId <= 0) {
      setError("Select a disposition reason before rejecting.");
      return;
    }
    const app = pendingReject.app;
    setBusyId(app.id);
    setError(null);
    try {
      if (pendingReject.kind === "interview") {
        const updated = await apiFetchJson<ApplicationRow>("/api/applications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: app.id,
            interview_decision: "rejected",
            send_email: true,
            disposition_reason_id: reasonId,
          }),
        });
        onStageUpdated(updated);
        setSuccess("Candidate marked rejected at current round.");
      } else {
        // `stage` + `drag` both PATCH stage to Rejected with audit reason (no PATCH is sent until the user picks a reason).
        const updated = await apiFetchJson<ApplicationRow>("/api/applications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: app.id,
            stage: "Rejected",
            disposition_reason_id: reasonId,
          }),
        });
        onStageUpdated(updated);
        setSuccess("Candidate moved to Rejected.");
      }
      setPendingReject(null);
    } catch (err: any) {
      if (!notifyForbidden(err)) setError(err.message || "Failed to update");
    } finally {
      setBusyId(null);
    }
  }

  async function patchAssignedRecruiter(app: ApplicationRow, newUserId: number | null) {
    setBusyId(app.id);
    setError(null);
    try {
      const updated = await apiFetchJson<ApplicationRow>("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: app.id, assigned_recruiter_user_id: newUserId }),
      });
      onStageUpdated(updated);
      setLocalApplications((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      setSuccess(newUserId == null ? "Owner cleared." : "Owner updated.");
      setChangeRecruiterApp(null);
    } catch (err: unknown) {
      if (!notifyForbidden(err)) {
        setError(err instanceof Error ? err.message : "Failed to update owner");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function confirmRemoveFromPipeline(app: ApplicationRow) {
    setBusyId(app.id);
    setError(null);
    try {
      await apiFetchJson(`/api/applications/${app.id}`, { method: "DELETE" });
      setLocalApplications((prev) => prev.filter((x) => x.id !== app.id));
      onApplicationRemoved?.(app.id);
      setRemoveConfirmApp(null);
      setSuccess("Removed from pipeline.");
    } catch (err: unknown) {
      if (!notifyForbidden(err)) {
        setError(err instanceof Error ? err.message : "Failed to remove");
      }
    } finally {
      setBusyId(null);
    }
  }

  async function resendScreeningTest(applicationId: number) {
    if (!canManage) {
      setError("You need pipeline.manage permission to resend tests.");
      return;
    }
    setBusyId(applicationId);
    setError(null);
    setSuccess(null);
    try {
      await apiFetchJson(`/api/screening-tests/by-application/${applicationId}/resend`, {
        method: "POST",
      });
      setSuccess("Screening test resent.");
      const latest = await apiFetchJson<{ test: ScreeningTestSummary | null }>(
        `/api/screening-tests/by-application/${applicationId}`
      );
      setScreeningByApplication((prev) => ({ ...prev, [applicationId]: latest.test || null }));
    } catch (err: any) {
      if (!notifyForbidden(err)) setError(err.message || "Failed to resend screening test");
    } finally {
      setBusyId(null);
    }
  }

  function buildCardActionItems(a: ApplicationRow, stage: Stage): RowActionItem[] {
    const items: RowActionItem[] = [];
    if (stage === "Interview") {
      if (a.interview_datetime) {
        items.push({
          type: "button",
          label: "Reschedule interview",
          icon: <Calendar className="h-3.5 w-3.5" />,
          onClick: () => openRescheduleModal(a),
        });
      } else {
        items.push({
          type: "button",
          label: "Schedule interview",
          icon: <Calendar className="h-3.5 w-3.5" />,
          onClick: () => openScheduleModal(a),
        });
      }
      items.push({
        type: "button",
        label: "Interview decision…",
        icon: <ClipboardList className="h-3.5 w-3.5" />,
        onClick: () => {
          setDecisionApp(a);
          setDecisionOpen(true);
        },
      });
    } else {
      for (const s of nextStages(stage)) {
        items.push({
          type: "button",
          label: s === "Interview" ? "Move to Interview" : `Move to ${s}`,
          onClick: () => {
            if (s === "Interview") openScheduleModal(a);
            else void updateStage(a.id, s);
          },
        });
      }
      if (stage === "Screening" || stage === "Screening Failed") {
        items.push({
          type: "button",
          label: "Resend screening test",
          onClick: () => resendScreeningTest(a.id),
        });
      }
    }
    if (canManage) {
      items.push({
        type: "button",
        label: "Change recruiter…",
        onClick: () => {
          setChangeRecruiterApp(a);
          setChangeRecruiterUserId(
            a.assigned_recruiter_user_id != null ? String(a.assigned_recruiter_user_id) : ""
          );
        },
      });
      items.push({
        type: "button",
        label: "Remove from pipeline",
        onClick: () => setRemoveConfirmApp(a),
      });
    }
    return items;
  }

  return (
    <div className="space-y-3">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={4500} /> : null}
      <DispositionReasonModal
        open={pendingReject !== null}
        reasonSet="application_reject"
        title={pendingReject?.kind === "interview" ? "Interview rejection reason" : "Move to Rejected"}
        description="Select a disposition reason. It is stored for audit and reporting."
        confirmLabel={pendingReject?.kind === "interview" ? "Reject candidate" : "Confirm"}
        onClose={() => setPendingReject(null)}
        onConfirm={async (rid) => {
          await submitRejectDisposition(rid);
        }}
      />

      {changeRecruiterApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setChangeRecruiterApp(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Change recruiter (owner)</h3>
            <p className="mt-1 text-sm text-slate-600">
              {changeRecruiterApp.candidate_full_name} — {changeRecruiterApp.job_title}
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">Accountable recruiter</label>
            <select
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={changeRecruiterUserId}
              onChange={(e) => setChangeRecruiterUserId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {recruiters.map((r) => (
                <option key={r.id} value={String(r.id)}>
                  {r.full_name}
                </option>
              ))}
            </select>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setChangeRecruiterApp(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={busyId === changeRecruiterApp.id}
                onClick={() =>
                  void patchAssignedRecruiter(
                    changeRecruiterApp,
                    changeRecruiterUserId === "" ? null : Number(changeRecruiterUserId)
                  )
                }
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {removeConfirmApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={() => setRemoveConfirmApp(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Remove from pipeline?</h3>
            <p className="mt-2 text-sm text-slate-600">
              This removes the application for{" "}
              <strong>{removeConfirmApp.candidate_full_name}</strong> on{" "}
              <strong>{removeConfirmApp.job_title}</strong>. The candidate profile is not deleted.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setRemoveConfirmApp(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                disabled={busyId === removeConfirmApp.id}
                onClick={() => void confirmRemoveFromPipeline(removeConfirmApp)}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="text-red-600 text-sm">{error}</div>}
      {success && <div className="text-emerald-700 text-sm font-medium">{success}</div>}

      {scheduleOpen && scheduleApp && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setScheduleOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-md border border-slate-200 p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-lg font-semibold">Schedule Interview</div>
                  <div className="text-sm text-slate-600">
                    {scheduleApp.candidate_full_name} — {scheduleApp.job_title}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition-all duration-200"
                  disabled={busyId === scheduleApp.id}
                >
                  Close
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-sm text-gray-600">Date</label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    disabled={busyId === scheduleApp.id}
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm text-gray-600">Time</label>
                  <input
                    type="time"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    disabled={busyId === scheduleApp.id}
                  />
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Interview Questions Checklist</div>
                {checklistLoading ? <div className="mt-2 text-xs text-slate-500">Loading checklist...</div> : null}
                <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
                  {checklist.map((item, idx) => (
                    <div key={item.question_id} className="rounded-lg border border-slate-200 p-2">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={Boolean(item.asked)}
                          onChange={(e) =>
                            setChecklist((prev) => prev.map((x, i) => (i === idx ? { ...x, asked: e.target.checked } : x)))
                          }
                        />
                        <span className="text-xs font-medium text-slate-800">
                          [{item.category}] {item.question}
                        </span>
                      </label>
                      <textarea
                        className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                        placeholder="Notes..."
                        value={item.notes || ""}
                        onChange={(e) =>
                          setChecklist((prev) => prev.map((x, i) => (i === idx ? { ...x, notes: e.target.value } : x)))
                        }
                      />
                    </div>
                  ))}
                  {!checklistLoading && checklist.length === 0 ? (
                    <div className="text-xs text-slate-500">No job questions configured.</div>
                  ) : null}
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={submitInterviewSchedule}
                  disabled={busyId === scheduleApp.id || checklistSaving}
                  className="w-full bg-blue-600 text-white rounded-xl px-4 py-2 hover:bg-blue-700 transition-all duration-200 disabled:opacity-50"
                >
                  {busyId === scheduleApp.id || checklistSaving ? "Scheduling..." : "Schedule & Move to Interview"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmScheduleOpen && scheduleApp && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmScheduleOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-md border border-slate-200 p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-lg font-semibold">Confirm Interview Schedule</div>
                  <div className="mt-2 text-sm text-slate-600">
                    <div className="font-medium text-slate-900">{scheduleApp.candidate_full_name}</div>
                    <div className="text-slate-700">{scheduleApp.job_title}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmScheduleOpen(false)}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition-all duration-200"
                  disabled={busyId === scheduleApp.id}
                >
                  Cancel
                </button>
              </div>

              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">Interview Date & Time</div>
                <div className="text-sm text-slate-700">
                  {confirmScheduleIso ? new Date(confirmScheduleIso).toLocaleString() : "—"}
                </div>
              </div>

              <div className="mt-5 text-sm text-slate-700">
                Do you want to schedule this interview and send email to candidate?
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={confirmInterviewSchedule}
                  disabled={busyId === scheduleApp.id}
                  className="w-full bg-blue-600 text-white rounded-xl px-4 py-2 hover:bg-blue-700 transition-all duration-200 disabled:opacity-50"
                >
                  {busyId === scheduleApp.id ? "Scheduling..." : "Confirm"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rescheduleOpen && rescheduleApp && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setRescheduleOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-md border border-slate-200 p-6">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <div className="text-lg font-semibold">Reschedule Interview</div>
                  <div className="text-sm text-slate-600">
                    {rescheduleApp.candidate_full_name} — {rescheduleApp.job_title}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRescheduleOpen(false)}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition-all duration-200"
                  disabled={busyId === rescheduleApp.id}
                >
                  Close
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-sm text-gray-600">Date</label>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    disabled={busyId === rescheduleApp.id}
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm text-gray-600">Time</label>
                  <input
                    type="time"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={rescheduleTime}
                    onChange={(e) => setRescheduleTime(e.target.value)}
                    disabled={busyId === rescheduleApp.id}
                  />
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={submitInterviewReschedule}
                  disabled={busyId === rescheduleApp.id}
                  className="w-full bg-blue-600 text-white rounded-xl px-4 py-2 hover:bg-blue-700 transition-all duration-200 disabled:opacity-50"
                >
                  {busyId === rescheduleApp.id ? "Rescheduling..." : "Reschedule"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {decisionOpen && decisionApp ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDecisionOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
              <div className="text-lg font-semibold text-slate-900">Interview Decision</div>
              <div className="mt-1 text-sm text-slate-600">
                {decisionApp.candidate_full_name} — {decisionApp.job_title}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Current: {decisionApp.current_interview_round_label || `Round ${decisionApp.current_interview_round_order || 0}`}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => takeInterviewDecision(decisionApp, "next_round")}
                  disabled={busyId === decisionApp.id}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  Client confirmed - Move to Next Round
                </button>
                <button
                  type="button"
                  onClick={() => takeInterviewDecision(decisionApp, "final_selected")}
                  disabled={busyId === decisionApp.id}
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  Final confirmed - Mark Selected
                </button>
                <button
                  type="button"
                  onClick={() => takeInterviewDecision(decisionApp, "rejected")}
                  disabled={busyId === decisionApp.id}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  Mark Rejected (at current round)
                </button>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDecisionOpen(false)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* touch-pan-y: reduce browser stealing horizontal drags as scroll on wide overflow-x boards */}
        <div className="overflow-x-auto overflow-y-visible rounded-2xl border border-gray-200 bg-white p-4 shadow-sm touch-pan-y">
        <div className={["grid grid-cols-1 md:grid-cols-3 items-stretch", boardMinWidth, columnGap].join(" ")}>
          {STAGES.map((stage) => (
            <div
              key={stage}
              className={[
                "rounded-2xl border border-slate-200 bg-white h-full flex flex-col",
                columnPad,
                stage === "Applied"
                  ? "md:col-start-1 md:row-start-1"
                  : stage === "Screening"
                    ? "md:col-start-2 md:row-start-1"
                    : stage === "Screening Failed"
                      ? "md:col-start-1 md:row-start-2"
                    : stage === "Interview"
                      ? "md:col-start-3 md:row-start-1"
                      : stage === "Selected"
                        ? "md:col-start-2 md:row-start-2"
                        : "md:col-start-3 md:row-start-2",
              ].join(" ")}
            >
              {typeof WIP_LIMITS[stage] === "number" && grouped[stage].length > (WIP_LIMITS[stage] as number) ? (
                <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">
                  Over WIP limit ({grouped[stage].length}/{WIP_LIMITS[stage]})
                </div>
              ) : null}
              <div className={["sticky top-0 z-10 rounded-xl p-3", stageStyles[stage].headerBg].join(" ")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{stage}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-slate-600/90 leading-snug">{STAGE_HINTS[stage]}</div>
                  </div>
                  <div
                    className={[
                      "text-xs font-semibold px-2 py-1 rounded-full shrink-0",
                      stageStyles[stage].badgeBg,
                      stageStyles[stage].badgeText,
                    ].join(" ")}
                  >
                    {grouped[stage].length}
                  </div>
                </div>
              </div>

              {/* ignoreContainerClipping: required for cross-column drops when lists use overflow scroll (library default clips drag to one column) */}
              <Droppable droppableId={stage} ignoreContainerClipping>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={[
                      "mt-3 min-h-[180px] max-h-[58vh] flex-1 overflow-y-auto overscroll-y-contain pr-1 touch-pan-y",
                      cardGap,
                    ].join(" ")}
                  >
                    {grouped[stage].map((a, index) => (
                      <Draggable draggableId={`app-${a.id}`} index={index} key={a.id} isDragDisabled={dndDisabled}>
                        {(draggableProvided, draggableSnapshot) => (
                          <div
                            ref={draggableProvided.innerRef}
                            {...draggableProvided.draggableProps}
                            {...draggableProvided.dragHandleProps}
                            className={[
                              "bg-white shadow-sm rounded-xl border border-slate-200 transition-all duration-200 hover:shadow-md",
                              dndDisabled ? "" : "cursor-grab active:cursor-grabbing",
                              cardPad,
                              draggableSnapshot.isDragging ? "ring-2 ring-blue-500 shadow-lg" : "",
                            ].join(" ")}
                            style={draggableProvided.draggableProps.style}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-3">
                                <span
                                  className="mt-1 select-none text-slate-400"
                                  aria-hidden
                                  title="Drag card from anywhere, or use actions below"
                                >
                                  ⋮⋮
                                </span>
                                <div className="min-w-0">
                                  <div className={cardTitleClass}>
                                    {a.candidate_full_name}
                                  </div>
                                  <div className={cardSubClass}>{a.job_title}</div>
                                  <div className={cardSubClass}>{a.job_company || "Client N/A"}</div>
                                  <div className="mt-1 text-[11px] text-slate-600">
                                    <span className="font-semibold text-slate-700">Owner:</span>{" "}
                                    {a.assigned_recruiter_name
                                      ? a.assigned_recruiter_name
                                      : a.assigned_recruiter_user_id
                                        ? `User #${a.assigned_recruiter_user_id}`
                                        : "Unassigned"}
                                    {currentUserId != null && a.assigned_recruiter_user_id === currentUserId ? (
                                      <span className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                                        You
                                      </span>
                                    ) : null}
                                  </div>
                                  {a.stage === "Interview" ? (
                                    <div className="mt-1 text-[11px] font-semibold text-indigo-700">
                                      {a.current_interview_round_label || `Round ${a.current_interview_round_order ?? 1}`}
                                      {typeof a.interview_round_total === "number" && a.interview_round_total > 0 ? (
                                        (() => {
                                          const currentOrder = a.current_interview_round_order ?? 1;
                                          const completed = Math.max(0, currentOrder - 1);
                                          return ` (${completed}/${a.interview_round_total}) completed`;
                                        })()
                                      ) : null}
                                      {a.current_interview_round_order && a.current_interview_round_order > 1 ? (
                                        <span className="ml-2 font-semibold text-indigo-700/90">
                                          Round {a.current_interview_round_order - 1} completed
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  {a.stage === "Rejected" && a.rejected_in_round_order ? (
                                    <div className="mt-1 text-[11px] font-semibold text-rose-700">
                                      Rejected in Round {a.rejected_in_round_order}
                                    </div>
                                  ) : null}
                                  {a.stage === "Selected" && a.selected_after_rounds ? (
                                    <div className="mt-1 text-[11px] font-semibold text-emerald-700">
                                      Selected after {a.selected_after_rounds} rounds
                                    </div>
                                  ) : null}
                                  {(a.stage === "Screening" || a.stage === "Screening Failed") ? (
                                    <div className="mt-1 text-[11px] text-slate-700">
                                      {(() => {
                                        const s = screeningByApplication[a.id];
                                        if (!s) return "Screening test pending trigger";
                                        const score = s.score == null ? "" : ` - score ${s.score}/100`;
                                        return `Test: ${s.status}${score}`;
                                      })()}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <StatusBadge status={a.stage} />
                            </div>

                            <div
                              className="pt-2.5 flex justify-end"
                              onMouseDown={stopDragMouseDown}
                              onTouchStart={stopDragMouseDown}
                              onPointerDown={stopDragMouseDown}
                            >
                              {!canManage ? (
                                <span className="text-[10px] font-medium text-slate-400">View only</span>
                              ) : (
                                <div className={busyId === a.id ? "pointer-events-none opacity-50" : ""}>
                                  <RowActionsMenu
                                    ariaLabel={`Actions for ${a.candidate_full_name}`}
                                    items={buildCardActionItems(a, stage)}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}

                    {grouped[stage].length === 0 && (
                      <div className="rounded-xl border border-dashed bg-gray-50 p-6 text-center">
                        <div className="text-sm font-medium text-slate-700">Empty</div>
                        <div className="text-xs text-slate-500">No candidates in {stage}.</div>
                      </div>
                    )}

                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
        </div>
      </DragDropContext>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        <p className="max-w-3xl">
          <span className="font-semibold text-slate-800">Drag &amp; drop:</span> drag the <strong>card</strong> (not only the grip) to move across
          stages or reorder in a column. Stage changes save to the server; column order is local until refresh. Use the row ⋮ menu for scheduling and
          decisions without starting a drag.
        </p>
      </div>
    </div>
  );
}

