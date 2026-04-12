import { query } from "@/lib/db";
import { getCareersPublisherUserId } from "@/lib/careersPublisher";

export type PublicCareersJob = {
  id: number;
  title: string;
  location: string;
  status: string;
  open_positions: number;
  employment_type: string | null;
  description: string | null;
  experience_requirement: string | null;
  created_at: string | null;
  created_by_user_id?: number;
};

export async function getPublicCareersJob(jobId: number): Promise<{
  configured: boolean;
  job: PublicCareersJob | null;
}> {
  const publisherId = getCareersPublisherUserId();
  if (publisherId == null) {
    return { configured: false, job: null };
  }

  const res = await query(
    `
    SELECT
      id,
      title,
      COALESCE(NULLIF(location, ''), 'Location not specified') AS location,
      COALESCE(status, 'Open') AS status,
      COALESCE(open_positions, 0) AS open_positions,
      NULLIF(employment_type, '') AS employment_type,
      description,
      NULLIF(experience_requirement, '') AS experience_requirement,
      created_at,
      created_by_user_id
    FROM jobs
    WHERE id = $1
    LIMIT 1
    `,
    [jobId]
  );

  if (res.rowCount === 0) {
    return { configured: true, job: null };
  }

  const row = res.rows[0] as PublicCareersJob;
  const status = String(row.status || "").toLowerCase();
  const openPositions = Number(row.open_positions || 0);
  if (!status.includes("open") || openPositions <= 0) {
    return { configured: true, job: null };
  }

  return { configured: true, job: row };
}
