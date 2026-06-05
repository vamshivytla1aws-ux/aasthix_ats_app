import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { fetchApplicationCardRow } from "@/lib/applicationCard";
import { requirePermission } from "@/lib/rbac";
import { draftInterviewInviteWithAi } from "@/lib/interviewInviteDraft";
import { ATS_TIMEZONE_LABEL, formatInAtsTimezone } from "@/lib/timezones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(raw: unknown) {
  if (typeof raw !== "string") return [] as string[];
  return Array.from(
    new Set(
      raw
        .split(/[,;\n]+/)
        .map((part) => part.trim().toLowerCase())
        .filter((part) => EMAIL_RE.test(part))
    )
  );
}

function formatDateTimeLabel(value: string) {
  return formatInAtsTimezone(value);
}

function normalizeDurationMinutes(raw: unknown) {
  const value = Number(raw);
  return value === 15 || value === 30 || value === 45 || value === 60 ? value : 60;
}

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const applicationId = Number(context.params.id);
    if (!Number.isFinite(applicationId) || applicationId <= 0) {
      return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      interviewDatetime?: string;
      timezoneLabel?: string;
      meetingMode?: string;
      meetingLocation?: string;
      panelEmails?: string;
      notes?: string;
      meetLink?: string | null;
      isReschedule?: boolean;
      durationMinutes?: number;
    };

    if (typeof body.interviewDatetime !== "string" || !body.interviewDatetime.trim()) {
      return NextResponse.json({ error: "interviewDatetime is required." }, { status: 400 });
    }

    const row = await fetchApplicationCardRow(applicationId, user.user_id);
    if (!row) {
      return NextResponse.json({ error: "Application not found or not accessible." }, { status: 404 });
    }

    const jobId = Number(row.job_id);
    let jdExcerpt = "";
    if (Number.isFinite(jobId) && jobId > 0) {
      const jdRes = await query(`SELECT COALESCE(description, '') AS description FROM jobs WHERE id = $1 LIMIT 1`, [jobId]);
      jdExcerpt = String((jdRes.rows?.[0] as { description?: string } | undefined)?.description ?? "").slice(0, 8000);
    }

    const draft = await draftInterviewInviteWithAi({
      candidateName: typeof row.candidate_full_name === "string" ? row.candidate_full_name : null,
      candidateEmail: typeof row.candidate_email === "string" ? row.candidate_email : null,
      jobTitle: typeof row.job_title === "string" ? row.job_title : null,
      company: typeof row.job_company === "string" ? row.job_company : null,
      jobLocation: typeof row.job_location === "string" ? row.job_location : null,
      jdExcerpt,
      interviewDateTimeLabel: formatDateTimeLabel(body.interviewDatetime),
      timezoneLabel: ATS_TIMEZONE_LABEL,
      meetingMode: body.meetingMode ?? null,
      meetingLocation: body.meetingLocation ?? null,
      meetLink: body.meetLink ?? null,
      panelEmails: parseEmails(body.panelEmails),
      durationLabel: `${normalizeDurationMinutes(body.durationMinutes)} minutes`,
      recruiterName: typeof row.assigned_recruiter_name === "string" ? row.assigned_recruiter_name : null,
      notes: body.notes ?? null,
      isReschedule: Boolean(body.isReschedule),
    });

    return NextResponse.json({
      subject: draft.subject,
      body: draft.body,
      source: draft.source,
      defaultTo: typeof row.candidate_email === "string" ? row.candidate_email : "",
      defaultCc: parseEmails(body.panelEmails),
    });
  } catch (error) {
    console.error("POST /api/applications/[id]/draft-interview-invite", error);
    return NextResponse.json({ error: "Failed to draft interview invite." }, { status: 500 });
  }
}
