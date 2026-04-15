import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/audit/disposition-events
 *
 * Paginated, read-only listing of every disposition event (reject, withdraw,
 * job-close) with joined reason label, actor email, and entity reference.
 *
 * Query params:
 *   page          – 1-based page number (default 1)
 *   limit         – rows per page, max 200 (default 50)
 *   entity_type   – "application" | "job"
 *   entity_id     – filter to a single entity
 *   reason_category – "reject" | "withdraw" | "job_close"
 *   user_id       – filter by the actor who recorded the event
 */
export async function GET(request: Request) {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 50));
    const offset = (page - 1) * limit;

    const entityType = searchParams.get("entity_type");
    const entityId = searchParams.get("entity_id");
    const reasonCategory = searchParams.get("reason_category");
    const userId = searchParams.get("user_id");

    const vals: unknown[] = [];
    const wheres: string[] = [];

    if (entityType && ["application", "job"].includes(entityType)) {
      vals.push(entityType);
      wheres.push(`de.entity_type = $${vals.length}`);
    }
    if (entityId && Number.isFinite(Number(entityId))) {
      vals.push(Number(entityId));
      wheres.push(`de.entity_id = $${vals.length}`);
    }
    if (reasonCategory && ["reject", "withdraw", "job_close"].includes(reasonCategory)) {
      vals.push(reasonCategory);
      wheres.push(`dr.category = $${vals.length}`);
    }
    if (userId && Number.isFinite(Number(userId))) {
      vals.push(Number(userId));
      wheres.push(`de.user_id = $${vals.length}`);
    }

    const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";

    const countSql = `
      SELECT COUNT(*) AS total
      FROM disposition_events de
      JOIN disposition_reasons dr ON dr.id = de.disposition_reason_id
      ${whereClause}
    `;
    const countRes = await query(countSql, vals);
    const total = Number((countRes.rows[0] as { total: string }).total);

    const dataSql = `
      SELECT
        de.id,
        de.user_id,
        u.email       AS user_email,
        de.entity_type,
        de.entity_id,
        de.disposition_reason_id,
        dr.code       AS reason_code,
        dr.label      AS reason_label,
        dr.category   AS reason_category,
        de.notes,
        de.metadata,
        de.created_at,
        CASE
          WHEN de.entity_type = 'job' THEN (SELECT j.title FROM jobs j WHERE j.id = de.entity_id LIMIT 1)
          ELSE NULL
        END AS job_title,
        CASE
          WHEN de.entity_type = 'application' THEN (
            SELECT j.title FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = de.entity_id LIMIT 1
          )
          ELSE NULL
        END AS application_job_title,
        CASE
          WHEN de.entity_type = 'application' THEN (
            SELECT c.name FROM applications a JOIN candidates c ON c.id = a.candidate_id WHERE a.id = de.entity_id LIMIT 1
          )
          ELSE NULL
        END AS application_candidate_name
      FROM disposition_events de
      JOIN disposition_reasons dr ON dr.id = de.disposition_reason_id
      JOIN users u ON u.id = de.user_id
      ${whereClause}
      ORDER BY de.created_at DESC
      LIMIT $${vals.length + 1} OFFSET $${vals.length + 2}
    `;
    vals.push(limit, offset);

    const dataRes = await query(dataSql, vals);

    return NextResponse.json({
      events: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "42P01") {
      return NextResponse.json({
        events: [],
        pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
      });
    }
    console.error("Error listing disposition events", e);
    return NextResponse.json({ error: "Failed to list disposition events" }, { status: 500 });
  }
}
