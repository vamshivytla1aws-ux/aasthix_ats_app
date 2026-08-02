import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { refreshResumeEmbeddingForCandidate } from "@/lib/candidates/refreshResumeEmbedding";
import { persistCandidateDerivedProfile } from "@/lib/candidateDerivedProfileDb";
import { parseResumeBuffer } from "@/lib/resumeParser";
import { buildResumeBlobRecord } from "@/lib/resumeStorage";
import { candidateAccessPredicate } from "@/lib/dataScope";

async function parseCandidatePayload(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("resume_file");
    const resumeFile = file instanceof File ? file : null;
    const resumeBytes = resumeFile ? Buffer.from(await resumeFile.arrayBuffer()) : null;
    const parsedResume =
      resumeFile && resumeBytes ? await parseResumeBuffer(resumeFile.name || "resume", resumeBytes) : null;
    const resumeRecord = await buildResumeBlobRecord({
      resumeUrl:
        parsedResume?.resume_url ??
        (typeof form.get("resume_url") === "string" ? String(form.get("resume_url")) : null),
      resumeText:
        parsedResume?.resume_text ??
        (typeof form.get("resume_text") === "string" ? String(form.get("resume_text")) : null),
      fileName: resumeFile?.name ?? null,
      fileType: resumeFile?.type ?? null,
      fileBytes: resumeBytes,
    });
    return {
      id: form.get("id"),
      full_name: typeof form.get("full_name") === "string" ? String(form.get("full_name")) : "",
      email: typeof form.get("email") === "string" ? String(form.get("email")) : "",
      phone: typeof form.get("phone") === "string" ? String(form.get("phone")) : null,
      linkedin_url: typeof form.get("linkedin_url") === "string" ? String(form.get("linkedin_url")) : null,
      website_url: typeof form.get("website_url") === "string" ? String(form.get("website_url")) : null,
      location: typeof form.get("location") === "string" ? String(form.get("location")) : null,
      skills: typeof form.get("skills") === "string" ? String(form.get("skills")) : null,
      current_salary: typeof form.get("current_salary") === "string" && String(form.get("current_salary")).trim() ? Number(form.get("current_salary")) : null,
      expected_salary: typeof form.get("expected_salary") === "string" && String(form.get("expected_salary")).trim() ? Number(form.get("expected_salary")) : null,
      notice_period: typeof form.get("notice_period") === "string" ? String(form.get("notice_period")) : null,
      experience_summary: typeof form.get("experience_summary") === "string" ? String(form.get("experience_summary")) : null,
      source: typeof form.get("source") === "string" ? String(form.get("source")) : null,
      ...resumeRecord,
    };
  }

  const body = await request.json();
  const resumeRecord = await buildResumeBlobRecord({
    resumeUrl: body.resume_url ?? null,
    resumeText: typeof body.resume_text === "string" ? body.resume_text : null,
  });
  return {
    ...body,
    ...resumeRecord,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("candidates.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const location = (url.searchParams.get("location") ?? "").trim();
    const skills = (url.searchParams.get("skills") ?? "").trim(); // new (string-based)
    const company = (url.searchParams.get("company") ?? "").trim();
    const status = (url.searchParams.get("status") ?? "").trim(); // All | Active | Placed
    const limitRaw = url.searchParams.get("limit");
    let limitValue: number | null = null;
    if (limitRaw != null && limitRaw !== "") {
      const n = Number(limitRaw);
      if (Number.isFinite(n) && n > 0) limitValue = Math.min(200, Math.floor(n));
    }

    const where: string[] = [candidateAccessPredicate("c", "$1")];
    const params: any[] = [auth.access.user_id];

    if (q.length > 0) {
      // Google-like search: split query into keywords and require *all* keywords to match
      // at least one of: full_name, location, or skills (comma-separated string).
      const keywords = q
        .split(/[\s,]+/g)
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 10);

      if (keywords.length > 0) {
        const keywordClauses = keywords.map((kw) => {
          params.push(`%${kw}%`);
          const idx = params.length;
          return `(
            COALESCE(NULLIF(TRIM(c.full_name), ''), SPLIT_PART(c.email, '@', 1)) ILIKE $${idx}
            OR c.location ILIKE $${idx}
            OR EXISTS (
              SELECT 1
              FROM unnest(string_to_array(COALESCE(c.skills, ''), ',')) AS s
              WHERE trim(s) ILIKE $${idx}
            )
          )`;
        });

        // All keywords must match somewhere.
        where.push(keywordClauses.join(" AND "));
      }
    }

    // Backward-compatible filters (not used by the new single search box UI, but kept).
    if (location.length > 0) {
      params.push(`%${location}%`);
      where.push(`c.location ILIKE $${params.length}`);
    }
    if (skills.length > 0) {
      params.push(`%${skills}%`);
      where.push(
        `EXISTS (
          SELECT 1
          FROM unnest(string_to_array(COALESCE(c.skills, ''), ',')) AS s
          WHERE trim(s) ILIKE $${params.length}
        )`
      );
    }
    if (company.length > 0) {
      params.push(`%${company}%`);
      where.push(
        `EXISTS (
          SELECT 1
          FROM applications a2
          JOIN jobs j2 ON j2.id = a2.job_id
          LEFT JOIN vendors v2 ON v2.id = j2.vendor_id
          WHERE a2.candidate_id = c.id
            AND COALESCE(v2.name, j2.company) ILIKE $${params.length}
        )`
      );
    }
    if (status === "Placed") {
      where.push(
        `EXISTS (
          SELECT 1
          FROM applications a3
          WHERE a3.candidate_id = c.id
            AND a3.stage = 'Selected'
        )`
      );
    } else if (status === "Active") {
      where.push(
        `NOT EXISTS (
          SELECT 1
          FROM applications a3
          WHERE a3.candidate_id = c.id
            AND a3.stage = 'Selected'
        )`
      );
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    if (limitValue != null) {
      params.push(limitValue);
    }
    const limitSql = limitValue != null ? `LIMIT $${params.length}` : "";

    const result = await query(
      `
      SELECT
        c.id,
        COALESCE(NULLIF(TRIM(c.full_name), ''), SPLIT_PART(c.email, '@', 1)) AS full_name,
        c.email,
        c.phone,
        c.created_at,
        c.linkedin_url,
        c.website_url,
        c.location,
        c.resume_url,
        c.skills,
        c.notice_period,
        c.current_salary,
        c.expected_salary,
        c.experience_summary,
        COALESCE(c.source, 'UI') AS source,
        STRING_AGG(DISTINCT v.name, ', ') AS applied_companies,
        STRING_AGG(DISTINCT j.title, ', ') AS applied_job_titles,
        STRING_AGG(DISTINCT COALESCE(v.name, j.company), ', ') AS applied_company_names,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM applications ax
            WHERE ax.candidate_id = c.id
              AND ax.stage = 'Selected'
          ) THEN 'Placed'
          ELSE 'Active'
        END AS status,
        CASE
          WHEN c.current_salary IS NOT NULL AND c.current_salary > 0 AND c.expected_salary IS NOT NULL
            THEN ((c.expected_salary - c.current_salary) / c.current_salary) * 100
          ELSE NULL
        END AS expected_percentage
      FROM candidates c
      LEFT JOIN applications a ON a.candidate_id = c.id
      LEFT JOIN jobs j ON j.id = a.job_id
      LEFT JOIN vendors v ON v.id = j.vendor_id
      ${whereSql}
      GROUP BY
        c.id, c.full_name, c.email, c.phone, c.created_at, c.linkedin_url, c.website_url, c.location, c.resume_url,
        c.skills, c.notice_period, c.current_salary, c.expected_salary, c.experience_summary, c.source, c.created_at
      ORDER BY c.created_at DESC NULLS LAST, c.id DESC
      ${limitSql}
      `,
      params
    );
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Error fetching candidates", error);
    return NextResponse.json({ error: "Failed to fetch candidates" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("candidates.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const body = await parseCandidatePayload(request);
    const {
      full_name,
      email,
      phone,
      linkedin_url,
      website_url,
      location,
      resume_url,
      resume_text,
      skills,
      current_salary,
      expected_salary,
      notice_period,
      experience_summary,
      source,
      resume_file_name,
      resume_file_type,
      resume_file_size,
      resume_blob,
    } = body;

    if (!full_name || !email) {
      return NextResponse.json(
        { error: "full_name and email are required" },
        { status: 400 }
      );
    }

    const src =
      typeof source === "string" && source.trim().length > 0 ? source.trim().slice(0, 80) : "UI";

    const insert = await query(
      `
      INSERT INTO candidates (
        full_name, email, phone, linkedin_url, website_url, location, resume_url, skills,
        notice_period, current_salary, expected_salary, experience_summary, source, location_source,
        resume_text, resume_file_name, resume_file_type, resume_file_size, resume_blob,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      ON CONFLICT (created_by_user_id, email) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone,
            linkedin_url = EXCLUDED.linkedin_url,
            website_url = EXCLUDED.website_url,
            location = CASE
              WHEN candidates.location_source = 'manual' THEN candidates.location
              ELSE EXCLUDED.location
            END,
            resume_url = COALESCE(EXCLUDED.resume_url, candidates.resume_url),
            resume_text = COALESCE(EXCLUDED.resume_text, candidates.resume_text),
            resume_file_name = COALESCE(EXCLUDED.resume_file_name, candidates.resume_file_name),
            resume_file_type = COALESCE(EXCLUDED.resume_file_type, candidates.resume_file_type),
            resume_file_size = COALESCE(EXCLUDED.resume_file_size, candidates.resume_file_size),
            resume_blob = COALESCE(EXCLUDED.resume_blob, candidates.resume_blob),
            skills = COALESCE(EXCLUDED.skills, candidates.skills),
            notice_period = COALESCE(EXCLUDED.notice_period, candidates.notice_period),
            current_salary = COALESCE(EXCLUDED.current_salary, candidates.current_salary),
            expected_salary = COALESCE(EXCLUDED.expected_salary, candidates.expected_salary),
            experience_summary = COALESCE(EXCLUDED.experience_summary, candidates.experience_summary),
            source = EXCLUDED.source,
            location_source = CASE
              WHEN candidates.location_source = 'manual' THEN 'manual'
              WHEN EXCLUDED.location IS NOT NULL THEN EXCLUDED.location_source
              ELSE candidates.location_source
            END,
            updated_at = NOW()
      RETURNING
        id,
        full_name,
        email,
        phone,
        created_at,
        linkedin_url,
        website_url,
        location,
        resume_url,
        skills,
        notice_period,
        current_salary,
        expected_salary,
        experience_summary,
        source,
        location_source
      `,
      [
        full_name,
        email,
        phone ?? null,
        linkedin_url ?? null,
        website_url ?? null,
        location ?? null,
        resume_url ?? null,
        typeof skills === "string" ? skills : null,
        typeof notice_period === "string" ? notice_period : null,
        current_salary ?? null,
        expected_salary ?? null,
        typeof experience_summary === "string" ? experience_summary : null,
        src,
        location ? "manual" : "parsed",
        typeof resume_text === "string" ? resume_text : null,
        resume_file_name ?? null,
        resume_file_type ?? null,
        resume_file_size ?? null,
        resume_blob ?? null,
        user.user_id,
      ]
    );

    const row = insert.rows[0] as { id: number };
    void persistCandidateDerivedProfile(row.id).catch(() => {});
    void refreshResumeEmbeddingForCandidate(row.id, user.user_id).catch(() => {});
    return NextResponse.json(insert.rows[0], { status: 201 });
  } catch (error: any) {
    console.error("Error creating candidate", error);
    if (error?.code === "23505") {
      return NextResponse.json(
        {
          error:
            "A candidate with this email already exists in your workspace. Open that profile and edit it instead.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create candidate" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requirePermission("candidates.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const body = await parseCandidatePayload(request);
    const {
      id,
      full_name,
      email,
      phone,
      linkedin_url,
      website_url,
      location,
      resume_url,
      resume_text,
      skills,
      current_salary,
      expected_salary,
      notice_period,
      experience_summary,
      source,
      resume_file_name,
      resume_file_type,
      resume_file_size,
      resume_blob,
    } = body ?? {};

    if (!id || !Number.isFinite(Number(id))) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    if (!full_name || !email) {
      return NextResponse.json(
        { error: "full_name and email are required" },
        { status: 400 }
      );
    }

    let updated;
    try {
      updated = await query(
        `
        UPDATE candidates
        SET
          full_name = $2,
          email = $3,
          phone = $4,
          linkedin_url = $5,
          website_url = $6,
          location = $7,
          location_source = CASE
            WHEN NULLIF(BTRIM(COALESCE($7::text, '')), '') IS NULL THEN 'parsed'
            ELSE 'manual'
          END,
          resume_url = $8,
          resume_text = COALESCE($9, resume_text),
          resume_file_name = COALESCE($10, resume_file_name),
          resume_file_type = COALESCE($11, resume_file_type),
          resume_file_size = COALESCE($12, resume_file_size),
          resume_blob = COALESCE($13, resume_blob),
          skills = $14,
          notice_period = $15,
          current_salary = $16,
          expected_salary = $17,
          experience_summary = COALESCE($18, experience_summary),
          source = COALESCE($19, source),
          updated_at = NOW()
        WHERE id = $1
      RETURNING
        id,
        full_name,
        email,
        phone,
        created_at,
        linkedin_url,
          website_url,
          location,
          resume_url,
          skills,
          current_salary,
          expected_salary,
          notice_period,
          experience_summary,
          source,
          location_source
        `,
        [
          Number(id),
          full_name,
          email,
          phone ?? null,
          linkedin_url ?? null,
          website_url ?? null,
          location ?? null,
          resume_url ?? null,
          typeof resume_text === "string" ? resume_text : null,
          resume_file_name ?? null,
          resume_file_type ?? null,
          resume_file_size ?? null,
          resume_blob ?? null,
          typeof skills === "string" ? skills : null,
          typeof notice_period === "string" ? notice_period : null,
          current_salary ?? null,
          expected_salary ?? null,
          typeof experience_summary === "string" ? experience_summary : null,
          typeof source === "string" && source.trim().length > 0 ? source.trim().slice(0, 80) : null,
        ]
      );
    } catch (error: any) {
      // Backward compatibility when notice_period column is not migrated yet.
      if (error?.code !== "42703") throw error;
      updated = await query(
        `
        UPDATE candidates
        SET
          full_name = $2,
          email = $3,
          phone = $4,
          linkedin_url = $5,
          website_url = $6,
          location = $7,
          location_source = CASE
            WHEN NULLIF(BTRIM(COALESCE($7::text, '')), '') IS NULL THEN 'parsed'
            ELSE 'manual'
          END,
          resume_url = $8,
          skills = $9,
          current_salary = $10,
          expected_salary = $11,
          updated_at = NOW()
        WHERE id = $1
      RETURNING
        id,
        full_name,
        email,
        phone,
        created_at,
        linkedin_url,
          website_url,
          location,
          resume_url,
          skills,
          current_salary,
          expected_salary,
          location_source
        `,
        [
          Number(id),
          full_name,
          email,
          phone ?? null,
          linkedin_url ?? null,
          website_url ?? null,
          location ?? null,
          resume_url ?? null,
          typeof skills === "string" ? skills : null,
          current_salary ?? null,
          expected_salary ?? null,
        ]
      );
    }

    if (updated.rowCount === 0) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    void persistCandidateDerivedProfile(Number(id)).catch(() => {});
    void refreshResumeEmbeddingForCandidate(Number(id), user.user_id).catch(() => {});

    return NextResponse.json(updated.rows[0]);
  } catch (error) {
    console.error("Error updating candidate", error);
    return NextResponse.json({ error: "Failed to update candidate" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requirePermission("candidates.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json().catch(() => null);
    const id = body?.id;

    if (!id || !Number.isFinite(Number(id))) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Clean up dependent rows for safety where FK isn't cascading.
    await query(
      `
      DELETE FROM applications
      WHERE candidate_id = $1
      `,
      [Number(id)]
    );

    const deleted = await query(
      `
      DELETE FROM candidates
      WHERE id = $1
      RETURNING id
      `,
      [Number(id)]
    );

    if (deleted.rowCount === 0) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: Number(id) });
  } catch (error) {
    console.error("Error deleting candidate", error);
    return NextResponse.json({ error: "Failed to delete candidate" }, { status: 500 });
  }
}
