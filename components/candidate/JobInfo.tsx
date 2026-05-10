type CandidateJobInfo = {
  job_title: string | null;
  stage: string | null;
  status: "Active" | "Placed";
  current_interview_round_label?: string | null;
  current_interview_round_order?: number | null;
  interview_round_total?: number | null;
  interview_substatus?: "scheduled" | "completed_followup" | "no_show" | "cancelled" | null;
  meet_link?: string | null;
  calendar_sync_status?: string | null;
};

type Density = "comfortable" | "compact" | "ultra";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ats-border-subtle)] bg-[var(--ats-bg-panel)] px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">{label}</span>
      <span className="text-sm font-semibold text-[var(--ats-text)]">{value}</span>
    </div>
  );
}

export default function JobInfo({
  candidate,
  density = "ultra",
}: {
  candidate: CandidateJobInfo;
  density?: Density;
}) {
  void density;

  const showInterviewRound =
    candidate.stage === "Interview" &&
    (candidate.current_interview_round_label != null || candidate.current_interview_round_order != null);

  const roundPrimary = showInterviewRound
    ? candidate.current_interview_round_label || `Round ${candidate.current_interview_round_order ?? 1}`
    : "Not started";

  const total = candidate.interview_round_total;
  const order = candidate.current_interview_round_order ?? 1;
  const completed =
    showInterviewRound && typeof total === "number" && total > 0 ? Math.max(0, order - 1) : null;
  const interviewStatus =
    candidate.stage === "Interview"
      ? candidate.interview_substatus === "completed_followup"
        ? "Interview completed — follow up pending"
        : candidate.interview_substatus === "no_show"
          ? "No show"
          : candidate.interview_substatus === "cancelled"
            ? "Cancelled"
            : candidate.interview_substatus === "scheduled"
              ? "Scheduled"
              : "Awaiting schedule / decision"
      : "—";

  return (
    <section className="space-y-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ats-text-soft)]">
          Application context
        </div>
        <div className="mt-1 text-sm text-[var(--ats-text-muted)]">
          The current job, pipeline stage, and interview progress for this profile.
        </div>
      </div>

      <div className="grid gap-2">
        <InfoRow label="Job title" value={candidate.job_title || "Not assigned"} />
        <InfoRow label="Pipeline stage" value={candidate.stage || "—"} />
        <InfoRow
          label="Interview round"
          value={
            showInterviewRound && completed !== null && typeof total === "number"
              ? `${roundPrimary} (${completed}/${total} completed)`
              : roundPrimary
          }
        />
        <InfoRow label="Interview status" value={interviewStatus} />
        <InfoRow label="Status" value={candidate.status} />
      </div>
      {candidate.stage === "Interview" ? (
        <div className="rounded-xl border border-[var(--ats-border-subtle)] bg-[var(--ats-bg-panel)] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">
              Google Meet
            </span>
            <span className="text-xs text-[var(--ats-text-muted)]">
              {candidate.calendar_sync_status === "meet_created" || candidate.calendar_sync_status === "invite_sent"
                ? "Invite sent"
                : candidate.calendar_sync_status === "calendar_sync_failed"
                  ? "Sync failed"
                  : candidate.calendar_sync_status === "google_not_connected"
                    ? "Google not connected"
                    : candidate.meet_link
                      ? "Available"
                      : "Not created"}
            </span>
          </div>
          {candidate.meet_link ? (
            <a
              href={candidate.meet_link}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Join Google Meet
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
