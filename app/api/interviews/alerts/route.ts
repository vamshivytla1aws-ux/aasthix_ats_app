import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AlertType = "ongoing" | "upcoming";
type AlertRow = {
  id: number;
  type: AlertType;
  candidate_full_name: string;
  job_title: string;
  interview_datetime: string | null;
};

function buildMessage(type: AlertType, candidateName: string, interviewDateTime: string | null) {
  if (type === "ongoing") {
    return `Interview in progress: ${candidateName}`;
  }

  if (!interviewDateTime) {
    return `Interview in 0 mins: ${candidateName}`;
  }

  const diffMs = new Date(interviewDateTime).getTime() - Date.now();
  const mins = Math.max(0, Math.round(diffMs / (1000 * 60)));
  return `Interview in ${mins} mins: ${candidateName}`;
}

export async function GET() {
  try {
    const auth = await requirePermission("interviews.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const result = await query(
      `
      SELECT
        a.id,
        CASE
          WHEN a.interview_datetime BETWEEN (NOW() - INTERVAL '1 hour') AND NOW() THEN 'ongoing'
          ELSE 'upcoming'
        END AS type,
        c.full_name AS candidate_full_name,
        j.title AS job_title,
        a.interview_datetime
      FROM applications a
      JOIN candidates c ON c.id = a.candidate_id
      JOIN jobs j ON j.id = a.job_id
      WHERE a.created_by_user_id = $1
        AND a.stage = 'Interview'
        AND a.interview_scheduled = true
        AND a.interview_datetime IS NOT NULL
        AND COALESCE(a.interview_substatus, 'scheduled') = 'scheduled'
        AND (
          a.interview_datetime BETWEEN (NOW() - INTERVAL '1 hour') AND NOW()
          OR a.interview_datetime BETWEEN NOW() AND (NOW() + INTERVAL '1 hour')
        )
      ORDER BY
        CASE
          WHEN a.interview_datetime BETWEEN (NOW() - INTERVAL '1 hour') AND NOW() THEN 0
          ELSE 1
        END ASC,
        a.interview_datetime ASC
      `,
      [user.user_id]
    );

    const alerts = (result.rows as AlertRow[]).map((row) => {
      const type = row.type;
      const candidateName = String(row.candidate_full_name || "Candidate");
      return {
        id: row.id,
        type,
        candidate_full_name: row.candidate_full_name,
        job_title: row.job_title,
        interview_datetime: row.interview_datetime,
        message: buildMessage(type, candidateName, row.interview_datetime),
      };
    });

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error("Error fetching interview alerts", error);
    return NextResponse.json({ error: "Failed to fetch interview alerts" }, { status: 500 });
  }
}

