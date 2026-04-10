import { query } from "@/lib/db";
import { applicationAccessPredicate, hasJobTeamTable } from "@/lib/applicationVisibility";

function cap(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n[…truncated for context limit]`;
}

export async function loadJobContext(jobId: number, maxChars: number): Promise<{ text: string } | { error: "not_found" }> {
  const res = await query(
    `
    SELECT
      j.id,
      j.title,
      j.company,
      j.location,
      j.status,
      j.description,
      j.employment_type,
      j.experience_requirement,
      j.open_positions
    FROM jobs j
    WHERE j.id = $1
    `,
    [jobId]
  );
  const row = res.rows[0] as
    | {
        id: number;
        title: string;
        company: string;
        location: string;
        status: string;
        description: string | null;
        employment_type: string | null;
        experience_requirement: string | null;
        open_positions: number | null;
      }
    | undefined;
  if (!row) return { error: "not_found" };

  const parts = [
    `## Job #${row.id}`,
    `Title: ${row.title}`,
    `Company: ${row.company}`,
    `Location: ${row.location}`,
    `Status: ${row.status}`,
    row.open_positions != null ? `Open positions: ${row.open_positions}` : null,
    row.employment_type ? `Employment: ${row.employment_type}` : null,
    row.experience_requirement ? `Experience (public): ${row.experience_requirement}` : null,
    "",
    "## Job description",
    cap(row.description || "(none)", Math.max(4000, Math.floor(maxChars * 0.6))),
  ].filter((x) => x != null) as string[];

  return { text: cap(parts.join("\n"), maxChars) };
}

export async function loadCandidateContext(
  candidateId: number,
  maxChars: number
): Promise<{ text: string } | { error: "not_found" }> {
  const cRes = await query(
    `
    SELECT
      c.id,
      c.full_name AS name,
      c.email,
      c.phone,
      c.location,
      c.skills,
      c.experience_summary,
      c.job_title,
      c.linkedin_url
    FROM candidates c
    WHERE c.id = $1
    `,
    [candidateId]
  );
  const c = cRes.rows[0] as
    | {
        id: number;
        name: string;
        email: string | null;
        phone: string | null;
        location: string | null;
        skills: string | null;
        experience_summary: string | null;
        job_title: string | null;
        linkedin_url: string | null;
      }
    | undefined;
  if (!c) return { error: "not_found" };

  const notesRes = await query(
    `
    SELECT note, created_at
    FROM candidate_notes
    WHERE candidate_id = $1
    ORDER BY created_at DESC
    LIMIT 8
    `,
    [candidateId]
  );
  const noteRows = notesRes.rows as Array<{ note: string; created_at: string }>;

  const stageRes = await query(
    `
    SELECT a.stage, a.status, j.title AS job_title, j.company
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.candidate_id = $1
    ORDER BY a.updated_at DESC NULLS LAST
    LIMIT 5
    `,
    [candidateId]
  );
  const apps = stageRes.rows as Array<{ stage: string; status: string; job_title: string; company: string }>;

  const parts = [
    `## Candidate #${c.id}`,
    `Name: ${c.name}`,
    c.email ? `Email: ${c.email}` : null,
    c.phone ? `Phone: ${c.phone}` : null,
    c.location ? `Location: ${c.location}` : null,
    c.job_title ? `Headline / target role: ${c.job_title}` : null,
    c.linkedin_url ? `LinkedIn: ${c.linkedin_url}` : null,
    "",
    "## Skills",
    cap(c.skills?.trim() || "(none listed)", 8000),
    "",
    "## Experience summary",
    cap(c.experience_summary?.trim() || "(none)", 12000),
  ].filter((x) => x != null) as string[];

  if (apps.length > 0) {
    parts.push("", "## Recent applications (job + stage)");
    for (const a of apps) {
      parts.push(`- ${a.job_title} @ ${a.company} — stage: ${a.stage}, status: ${a.status}`);
    }
  }

  if (noteRows.length > 0) {
    parts.push("", "## Recent internal notes (newest first)");
    for (const n of noteRows) {
      parts.push(`- (${new Date(n.created_at).toISOString().slice(0, 10)}) ${cap(n.note, 400)}`);
    }
  }

  return { text: cap(parts.join("\n"), maxChars) };
}

export async function loadApplicationContext(
  applicationId: number,
  userId: number,
  maxChars: number
): Promise<{ text: string } | { error: "not_found" }> {
  const hasTeam = await hasJobTeamTable();
  const pred = applicationAccessPredicate("a", "$2", hasTeam);

  const res = await query(
    `
    SELECT
      a.id,
      a.stage,
      a.status,
      a.source,
      a.applied_at,
      a.updated_at,
      j.id AS job_id,
      j.title AS job_title,
      j.company AS job_company,
      j.location AS job_location,
      j.description AS job_description,
      j.employment_type,
      j.experience_requirement,
      c.id AS candidate_id,
      c.full_name AS candidate_name,
      c.email AS candidate_email,
      c.phone AS candidate_phone,
      c.location AS candidate_location,
      c.skills AS candidate_skills,
      c.experience_summary AS candidate_experience_summary,
      c.job_title AS candidate_headline,
      u_ar.full_name AS assigned_recruiter_name,
      u_ar.email AS assigned_recruiter_email,
      u_cb.full_name AS created_by_name,
      u_cb.email AS created_by_email
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    JOIN candidates c ON c.id = a.candidate_id
    LEFT JOIN users u_ar ON u_ar.id = a.assigned_recruiter_user_id
    LEFT JOIN users u_cb ON u_cb.id = a.created_by_user_id
    WHERE a.id = $1 AND (${pred})
    `,
    [applicationId, userId]
  );

  const row = res.rows[0] as
    | {
        id: number;
        stage: string;
        status: string;
        source: string | null;
        applied_at: string | null;
        updated_at: string;
        job_id: number;
        job_title: string;
        job_company: string;
        job_location: string;
        job_description: string | null;
        employment_type: string | null;
        experience_requirement: string | null;
        candidate_id: number;
        candidate_name: string;
        candidate_email: string | null;
        candidate_phone: string | null;
        candidate_location: string | null;
        candidate_skills: string | null;
        candidate_experience_summary: string | null;
        candidate_headline: string | null;
        assigned_recruiter_name: string | null;
        assigned_recruiter_email: string | null;
        created_by_name: string | null;
        created_by_email: string | null;
      }
    | undefined;

  if (!row) return { error: "not_found" };

  const parts = [
    `## Application #${row.id}`,
    `Pipeline stage: ${row.stage}`,
    `Record status: ${row.status}`,
    row.source ? `Source: ${row.source}` : null,
    row.applied_at ? `Applied: ${row.applied_at}` : null,
    `Last updated: ${row.updated_at}`,
    "",
    "## Ownership",
    row.assigned_recruiter_name
      ? `Assigned recruiter: ${row.assigned_recruiter_name} <${row.assigned_recruiter_email || ""}>`
      : "Assigned recruiter: (none)",
    row.created_by_name
      ? `Application created by: ${row.created_by_name} <${row.created_by_email || ""}>`
      : "Application created by: (unknown)",
    "",
    "## Job",
    `Job #${row.job_id}: ${row.job_title} @ ${row.job_company} (${row.job_location})`,
    row.employment_type ? `Employment: ${row.employment_type}` : null,
    row.experience_requirement ? `Experience (public): ${row.experience_requirement}` : null,
    "",
    "### Job description",
    cap(row.job_description || "(none)", Math.max(4000, Math.floor(maxChars * 0.35))),
    "",
    "## Candidate",
    `Candidate #${row.candidate_id}: ${row.candidate_name}`,
    row.candidate_email ? `Email: ${row.candidate_email}` : null,
    row.candidate_phone ? `Phone: ${row.candidate_phone}` : null,
    row.candidate_location ? `Location: ${row.candidate_location}` : null,
    row.candidate_headline ? `Headline: ${row.candidate_headline}` : null,
    "",
    "### Skills",
    cap(row.candidate_skills?.trim() || "(none)", 6000),
    "",
    "### Experience summary",
    cap(row.candidate_experience_summary?.trim() || "(none)", 8000),
  ].filter((x) => x != null) as string[];

  return { text: cap(parts.join("\n"), maxChars) };
}
