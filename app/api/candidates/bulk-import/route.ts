import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { parseResumeBuffer } from "@/lib/resumeParser";

export const runtime = "nodejs";

type ImportItemResult = {
  file_name: string;
  ok: boolean;
  candidate_id?: number;
  full_name?: string | null;
  email?: string | null;
  reason?: string;
};

type ImportRowInput = {
  file_name?: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  location?: string | null;
  skills?: string | null;
  resume_url?: string | null;
};

type ImportOptions = {
  create_application?: boolean;
  job_id?: number | null;
};

async function upsertCandidate(
  userId: number,
  fileName: string,
  row: {
    full_name: string;
    email: string;
    phone?: string | null;
    linkedin_url?: string | null;
    location?: string | null;
    skills?: string | null;
    resume_url?: string | null;
  }
) {
  const insert = await query(
    `
    INSERT INTO candidates (
      full_name, email, phone, linkedin_url, location, resume_url, skills, created_by_user_id
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (created_by_user_id, email) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          phone = COALESCE(EXCLUDED.phone, candidates.phone),
          linkedin_url = COALESCE(EXCLUDED.linkedin_url, candidates.linkedin_url),
          location = COALESCE(EXCLUDED.location, candidates.location),
          resume_url = COALESCE(EXCLUDED.resume_url, candidates.resume_url),
          skills = COALESCE(EXCLUDED.skills, candidates.skills),
          updated_at = NOW()
    RETURNING id, full_name, email
    `,
    [
      row.full_name,
      row.email,
      row.phone ?? null,
      row.linkedin_url ?? null,
      row.location ?? null,
      row.resume_url ?? null,
      row.skills ?? null,
      userId,
    ]
  );

  const created = insert.rows[0] as { id: number; full_name: string; email: string };
  return {
    file_name: fileName,
    ok: true,
    candidate_id: created.id,
    full_name: created.full_name,
    email: created.email,
  } satisfies ImportItemResult;
}

async function ensureAppliedApplication(userId: number, candidateId: number, jobId: number) {
  await query(
    `
    INSERT INTO applications (candidate_id, job_id, stage, status, updated_at, created_by_user_id)
    VALUES ($1, $2, 'Applied', 'Applied', NOW(), $3)
    ON CONFLICT (candidate_id, job_id) DO UPDATE
      SET stage = 'Applied',
          status = 'Applied',
          updated_at = NOW()
    `,
    [candidateId, jobId, userId]
  );
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("candidates.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const results: ImportItemResult[] = [];
    let imported = 0;

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as { rows?: ImportRowInput[]; options?: ImportOptions } | null;
      const rows = Array.isArray(body?.rows) ? body!.rows : [];
      const options = body?.options || {};
      const createApplication = Boolean(options.create_application);
      const jobId = Number(options.job_id);
      if (createApplication) {
        const pipelineAuth = await requirePermission("pipeline.manage");
        if (!pipelineAuth.ok) {
          return NextResponse.json({ error: "pipeline.manage permission required for auto-application." }, { status: pipelineAuth.status });
        }
        if (!Number.isFinite(jobId) || jobId <= 0) {
          return NextResponse.json({ error: "Valid job_id is required when create_application is enabled." }, { status: 400 });
        }
      }
      if (rows.length === 0) {
        return NextResponse.json({ error: "rows[] is required for JSON import." }, { status: 400 });
      }
      if (rows.length > 50) {
        return NextResponse.json({ error: "Maximum 50 rows per batch." }, { status: 400 });
      }

      for (const item of rows) {
        const file_name = item.file_name || "resume";
        const email = (item.email || "").trim();
        const full_name = (item.full_name || "").trim();
        if (!email || !full_name) {
          results.push({
            file_name,
            ok: false,
            reason: "full_name and email are required",
          });
          continue;
        }
        try {
          const done = await upsertCandidate(user.user_id, file_name, {
            full_name,
            email,
            phone: item.phone || null,
            linkedin_url: item.linkedin_url || null,
            location: item.location || null,
            skills: item.skills || null,
            resume_url: item.resume_url || null,
          });
          imported += 1;
          if (createApplication && done.candidate_id) {
            await ensureAppliedApplication(user.user_id, done.candidate_id, jobId);
          }
          results.push(done);
        } catch (e: any) {
          results.push({
            file_name,
            ok: false,
            reason:
              e?.code === "23505"
                ? "Candidate with this email already exists in your workspace."
                : e?.message || "Failed to import this row",
          });
        }
      }
    } else {
      const form = await request.formData();
      const files = form.getAll("files").filter((x): x is File => x instanceof File);
      if (files.length === 0) {
        return NextResponse.json({ error: "No files uploaded. Use field name 'files'." }, { status: 400 });
      }
      if (files.length > 50) {
        return NextResponse.json({ error: "Maximum 50 resumes per batch." }, { status: 400 });
      }

      for (const file of files) {
        const file_name = file.name || "resume";
        try {
          const parsed = await parseResumeBuffer(file_name, Buffer.from(await file.arrayBuffer()));

          if (!parsed.email) {
            results.push({
              file_name,
              ok: false,
              reason: "Email not detected from resume. Please import this file manually.",
            });
            continue;
          }

          const done = await upsertCandidate(user.user_id, file_name, {
            full_name: parsed.full_name || parsed.email.split("@")[0] || "Unknown Candidate",
            email: parsed.email,
            phone: parsed.phone ?? null,
            linkedin_url: parsed.linkedin_url ?? null,
            location: parsed.location ?? null,
            skills: parsed.skills ?? null,
            resume_url: parsed.resume_url ?? null,
          });
          imported += 1;
          results.push(done);
        } catch (e: any) {
          results.push({
            file_name,
            ok: false,
            reason:
              e?.code === "23505"
                ? "Candidate with this email already exists in your workspace."
                : e?.message || "Failed to parse/import this resume",
          });
        }
      }
    }

    return NextResponse.json({
      total: results.length,
      imported,
      failed: results.length - imported,
      results,
    });
  } catch (error) {
    console.error("Bulk candidate import failed", error);
    return NextResponse.json({ error: "Failed to import resumes" }, { status: 500 });
  }
}
