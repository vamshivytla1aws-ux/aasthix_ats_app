"use client";

import React from "react";
import useSWR from "swr";
import { CalendarDays, RefreshCw, Save, Trash2 } from "lucide-react";
import AccessGate from "@/components/AccessGate";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import OperationResultBanner from "@/components/enterprise/OperationResultBanner";
import RowActionsMenu from "@/components/enterprise/RowActionsMenu";
import StatusBadge from "@/components/enterprise/StatusBadge";
import { apiFetchJson } from "@/lib/apiClient";
import { dashboardFetcher } from "@/lib/swrFetcher";
import { UI } from "@/lib/ui";
import { ATS_TIMEZONE_LABEL, formatInAtsTimezone, kolkataLocalToUtcIso } from "@/lib/timezones";

type TeamCalendarRecurrence = "none" | "daily" | "weekly" | "monthly";
type TeamCalendarStatus = "scheduled" | "updated" | "cancelled" | "sync_failed";

type TeamCalendarEvent = {
  id: number;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  recurrence: TeamCalendarRecurrence;
  recurrence_until: string | null;
  attendee_emails: string[];
  meet_link: string | null;
  status: TeamCalendarStatus;
  calendar_sync_error: string | null;
};

type EventsResponse = { events: TeamCalendarEvent[] };

function splitEmails(value: string) {
  return Array.from(
    new Set(
      String(value || "")
        .split(/[,;\n]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function toDateInput(value: string) {
  return value.slice(0, 10);
}

function toTimeInput(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "10:00";
  const local = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}

export default function TeamCalendarPage() {
  const [query, setQuery] = React.useState("");
  const [result, setResult] = React.useState<{ tone: "success" | "partial" | "blocked" | "error" | "info"; message: string; hint?: string } | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [editingEventId, setEditingEventId] = React.useState<number | null>(null);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [meetingDate, setMeetingDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [meetingTime, setMeetingTime] = React.useState("10:00");
  const [durationMinutes, setDurationMinutes] = React.useState(30);
  const [attendees, setAttendees] = React.useState("");
  const [recurrence, setRecurrence] = React.useState<TeamCalendarRecurrence>("none");
  const [recurrenceUntil, setRecurrenceUntil] = React.useState("");

  const swrKey = `/api/team-calendar/events?q=${encodeURIComponent(query)}`;
  const eventsSwr = useSWR<EventsResponse>(swrKey, dashboardFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });

  const events = eventsSwr.data?.events || [];

  function resetForm() {
    setEditingEventId(null);
    setTitle("");
    setDescription("");
    setMeetingDate(new Date().toISOString().slice(0, 10));
    setMeetingTime("10:00");
    setDurationMinutes(30);
    setAttendees("");
    setRecurrence("none");
    setRecurrenceUntil("");
  }

  function fillForEdit(event: TeamCalendarEvent) {
    setEditingEventId(event.id);
    setTitle(event.title);
    setDescription(event.description || "");
    setMeetingDate(toDateInput(event.start_at));
    setMeetingTime(toTimeInput(event.start_at));
    const minutes = Math.round((new Date(event.end_at).getTime() - new Date(event.start_at).getTime()) / (60 * 1000));
    setDurationMinutes(Number.isFinite(minutes) && minutes > 0 ? minutes : 30);
    setAttendees((event.attendee_emails || []).join(", "));
    setRecurrence(event.recurrence || "none");
    setRecurrenceUntil(event.recurrence_until || "");
  }

  async function saveEvent() {
    const startIso = kolkataLocalToUtcIso(meetingDate, meetingTime);
    if (!startIso) {
      setResult({ tone: "blocked", message: "Please enter a valid date and time.", hint: "Set date/time in IST and retry." });
      return;
    }
    const endIso = new Date(new Date(startIso).getTime() + Math.max(15, Number(durationMinutes || 30)) * 60 * 1000).toISOString();
    const payload = {
      title,
      description: description || null,
      start_at: startIso,
      end_at: endIso,
      recurrence,
      recurrence_until: recurrence === "none" ? null : recurrenceUntil || null,
      attendee_emails: splitEmails(attendees),
    };

    setBusy("save");
    try {
      let response: { operation_status?: "success" | "partial" | "blocked" | "error"; user_message?: string; hint?: string } | null = null;
      if (editingEventId) {
        response = await apiFetchJson(`/api/team-calendar/events/${editingEventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        response = await apiFetchJson("/api/team-calendar/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      const toneMap = {
        success: "success",
        partial: "partial",
        blocked: "blocked",
        error: "error",
      } as const;
      setResult({
        tone: toneMap[response?.operation_status || "success"] || "success",
        message:
          response?.user_message ||
          (editingEventId ? "Team meeting updated and calendar invite re-synced." : "Team meeting scheduled with Google Calendar invite."),
        hint: response?.hint,
      });
      await eventsSwr.mutate();
      resetForm();
    } catch (error) {
      setResult({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save meeting.",
        hint: "Check Google Calendar connection/scopes and try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function cancelMeeting(event: TeamCalendarEvent) {
    if (!window.confirm(`Cancel "${event.title}" and send cancellation to attendees?`)) return;
    setBusy(`cancel-${event.id}`);
    try {
      const response = await apiFetchJson<{
        operation_status?: "success" | "partial" | "blocked" | "error";
        user_message?: string;
        hint?: string;
      }>(`/api/team-calendar/events/${event.id}`, { method: "DELETE" });
      const toneMap = {
        success: "success",
        partial: "partial",
        blocked: "blocked",
        error: "error",
      } as const;
      setResult({
        tone: toneMap[response?.operation_status || "success"] || "success",
        message: response?.user_message || "Meeting cancelled and attendees notified.",
        hint: response?.hint,
      });
      await eventsSwr.mutate();
      if (editingEventId === event.id) resetForm();
    } catch (error) {
      setResult({ tone: "error", message: error instanceof Error ? error.message : "Failed to cancel meeting." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <AccessGate permissionKey="team_calendar.view">
      <ModulePageFrame
        title="Team Calendar"
        subtitle="Schedule internal one-time or recurring meetings with Google Meet and attendee invites."
        metrics={<StatusBadge status={`Timezone ${ATS_TIMEZONE_LABEL}`} />}
        actions={
          <button type="button" className={UI.secondaryButton + " py-2 text-sm"} onClick={() => void eventsSwr.mutate()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      >
        {result ? (
          <OperationResultBanner
            tone={result.tone}
            message={result.message}
            hint={result.hint}
            action={
              <button type="button" className="text-xs font-semibold underline underline-offset-2" onClick={() => setResult(null)}>
                Dismiss
              </button>
            }
          />
        ) : null}
        <section className={UI.card + " p-4 sm:p-5"}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[var(--ats-text)]">{editingEventId ? "Edit meeting" : "Create meeting"}</h2>
            {editingEventId ? (
              <button type="button" className={UI.secondaryButton + " py-2 text-sm"} onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className={UI.label}>Meeting title</label>
              <input className={UI.input} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Engineering sync" />
            </div>
            <div>
              <label className={UI.label}>Attendee emails</label>
              <input
                className={UI.input}
                value={attendees}
                onChange={(event) => setAttendees(event.target.value)}
                placeholder="teammate1@aasthix.com, teammate2@aasthix.com"
              />
            </div>
            <div>
              <label className={UI.label}>Date (IST)</label>
              <input type="date" className={UI.input} value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} />
            </div>
            <div>
              <label className={UI.label}>Time (IST)</label>
              <input type="time" className={UI.input} value={meetingTime} onChange={(event) => setMeetingTime(event.target.value)} />
            </div>
            <div>
              <label className={UI.label}>Duration</label>
              <select className={UI.select} value={String(durationMinutes)} onChange={(event) => setDurationMinutes(Number(event.target.value) || 30)}>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">1 hour</option>
              </select>
            </div>
            <div>
              <label className={UI.label}>Recurrence</label>
              <select className={UI.select} value={recurrence} onChange={(event) => setRecurrence(event.target.value as TeamCalendarRecurrence)}>
                <option value="none">No repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            {recurrence !== "none" ? (
              <div>
                <label className={UI.label}>Repeat until</label>
                <input type="date" className={UI.input} value={recurrenceUntil} onChange={(event) => setRecurrenceUntil(event.target.value)} />
              </div>
            ) : null}
          </div>
          <div className="mt-3">
            <label className={UI.label}>Notes (optional)</label>
            <textarea
              className={UI.input + " min-h-[104px] py-3"}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Agenda or context for attendees"
              rows={3}
            />
          </div>
          <div className="mt-4">
            <button type="button" className={UI.primaryButton + " py-2 text-sm"} onClick={() => void saveEvent()} disabled={busy === "save"}>
              <Save className="h-4 w-4" />
              {busy === "save" ? "Saving..." : editingEventId ? "Update meeting" : "Create meeting"}
            </button>
          </div>
        </section>

        <section className={UI.card + " mt-4 p-4 sm:p-5"}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[var(--ats-text)]">Upcoming meetings</h2>
            <input
              className={UI.input + " max-w-xs"}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title"
            />
          </div>
          <div className="space-y-3">
            {events.length === 0 ? <div className="text-sm text-[var(--ats-text-muted)]">No upcoming team meetings yet.</div> : null}
            {events.map((event) => (
              <div key={event.id} className={UI.sectionCard + " p-3"}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[var(--ats-text)]">{event.title}</div>
                    <div className="mt-1 text-xs text-[var(--ats-text-muted)]">
                      <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                      {formatInAtsTimezone(event.start_at)} - {formatInAtsTimezone(event.end_at, { hour: "2-digit", minute: "2-digit", hour12: true })}
                    </div>
                    <div className="mt-1 text-xs text-[var(--ats-text-muted)]">
                      {event.recurrence === "none"
                        ? "One-time meeting"
                        : `${event.recurrence.toUpperCase()} until ${event.recurrence_until || "end date not set"}`}
                    </div>
                    <div className="mt-1 text-xs text-[var(--ats-text-muted)]">Attendees: {(event.attendee_emails || []).join(", ") || "—"}</div>
                    {event.meet_link ? (
                      <a
                        className="mt-1 inline-block text-xs text-[var(--ats-brand)] underline"
                        href={event.meet_link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Join Meet link
                      </a>
                    ) : null}
                    {event.calendar_sync_error ? (
                      <div className="mt-1 text-xs text-[var(--ats-danger)]">{event.calendar_sync_error}</div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={event.status.replace("_", " ")} />
                    <RowActionsMenu
                      items={[
                        {
                          type: "button",
                          label: "Edit",
                          onClick: () => fillForEdit(event),
                        },
                        {
                          type: "button",
                          label: busy === `cancel-${event.id}` ? "Cancelling..." : "Cancel meeting",
                          onClick: () => void cancelMeeting(event),
                          danger: true,
                          icon: <Trash2 className="h-4 w-4" />,
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </ModulePageFrame>
    </AccessGate>
  );
}
