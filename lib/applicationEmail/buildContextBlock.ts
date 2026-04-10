/** Build plain-text context for the draft model from card row + optional JD excerpt. */
export function buildApplicationEmailContextBlock(
  row: Record<string, unknown>,
  jobDescriptionExcerpt: string | null
): string {
  const lines: string[] = [];
  lines.push(`Application ID: ${row.id}`);
  lines.push(`Pipeline stage: ${row.stage}`);
  lines.push(`Candidate: ${row.candidate_full_name ?? "Unknown"}`);
  lines.push(`Candidate email: ${row.candidate_email ?? "(not on file)"}`);
  if (row.candidate_phone) lines.push(`Candidate phone: ${String(row.candidate_phone)}`);
  lines.push(`Job: ${row.job_title ?? ""} at ${row.job_company ?? ""}`);
  if (row.job_location) lines.push(`Location: ${String(row.job_location)}`);
  if (row.assigned_recruiter_name) lines.push(`Assigned recruiter: ${String(row.assigned_recruiter_name)}`);
  lines.push("");
  lines.push("## Job description (excerpt)");
  lines.push((jobDescriptionExcerpt || "(none)").trim() || "(none)");
  return lines.join("\n");
}
