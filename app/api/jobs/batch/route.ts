import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  jobStatusRequiresDispositionReason,
  recordDispositionEvent,
  validateDispositionReason,
} from "@/lib/dispositionAudit";
import { validateStatusTransition } from "@/lib/jobStatusTransitions";

type BatchItem = {
  id: number;
  status?: string;
  open_positions?: number;
  disposition_reason_id?: number;
};

type BatchResult = {
  id: number;
  ok: boolean;
  updated?: Record<string, unknown>;
  error?: string;
};

/**
 * POST /api/jobs/batch
 * Bulk partial-update (status and/or open_positions) for multiple jobs in a
 * single request.  Disposition-reason enforcement mirrors PATCH /api/jobs/[id]:
 * Closed, Filled, and On Hold require a valid disposition_reason_id.
 *
 * Body:  { jobs: Array<{ id, status?, open_positions?, disposition_reason_id? }> }
 * Returns: { results: Array<{ id, ok, updated?, error? }> }
 */
export async function POST(request: Request) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const body = (await request.json()) as { jobs?: unknown };
    const items: BatchItem[] = Array.isArray(body?.jobs) ? (body.jobs as BatchItem[]) : [];

    if (items.length === 0) {
      return NextResponse.json(
        { error: "jobs array is required and must not be empty" },
        { status: 400 }
      );
    }
    if (items.length > 200) {
      return NextResponse.json({ error: "Maximum 200 jobs per batch" }, { status: 400 });
    }

    const results: BatchResult[] = [];

    for (const item of items) {
      const id = Number(item.id);
      if (!Number.isFinite(id)) {
        results.push({ id: item.id, ok: false, error: "Invalid job id" });
        continue;
      }

      const prevRes = await query(
        `SELECT status FROM jobs WHERE id = $1 AND created_by_user_id = $2 LIMIT 1`,
        [id, user.user_id]
      );
      if (!prevRes.rowCount) {
        results.push({ id, ok: false, error: "Job not found" });
        continue;
      }
      const prevStatus = String((prevRes.rows[0] as { status: string }).status || "");

      const newStatus =
        typeof item.status === "string" && item.status.trim() ? item.status.trim() : null;
      const statusChanging = newStatus !== null && newStatus !== prevStatus;

      if (statusChanging && newStatus !== null) {
        const tv = validateStatusTransition(prevStatus, newStatus);
        if (!tv.ok) {
          results.push({ id, ok: false, error: tv.message });
          continue;
        }
      }

      const needsDisposition =
        statusChanging && newStatus !== null && jobStatusRequiresDispositionReason(newStatus);

      let validatedReasonId: number | null = null;
      if (needsDisposition) {
        const rid = Number(item.disposition_reason_id);
        if (!Number.isFinite(rid) || rid <= 0) {
          results.push({
            id,
            ok: false,
            error: "disposition_reason_id is required when setting job status to Closed, Filled, or On Hold",
          });
          continue;
        }
        const v = await validateDispositionReason(rid, ["job_close"]);
        if (!v.ok) {
          results.push({ id, ok: false, error: v.error ?? "Invalid disposition reason" });
          continue;
        }
        validatedReasonId = rid;
      }

      const sets: string[] = [];
      const vals: unknown[] = [];

      if (newStatus !== null) {
        vals.push(newStatus);
        sets.push(`status = $${vals.length}`);
      }
      if (item.open_positions !== undefined && item.open_positions !== null) {
        const p = Number(item.open_positions);
        if (Number.isFinite(p) && p >= 1) {
          vals.push(Math.trunc(p));
          sets.push(`open_positions = $${vals.length}`);
        }
      }

      if (sets.length === 0) {
        results.push({ id, ok: false, error: "No valid fields to update" });
        continue;
      }

      const idIdx = vals.length + 1;
      const userIdx = vals.length + 2;
      vals.push(id, user.user_id);

      const result = await query(
        `UPDATE jobs
         SET ${sets.join(", ")}, updated_at = NOW()
         WHERE id = $${idIdx} AND created_by_user_id = $${userIdx}
         RETURNING id, title, company, location, status, open_positions, employment_type, created_at, vendor_id`,
        vals
      );

      if (result.rows.length === 0) {
        results.push({ id, ok: false, error: "Job not found or not owned" });
        continue;
      }

      const row = result.rows[0] as { status: string };

      if (needsDisposition && validatedReasonId !== null) {
        try {
          await recordDispositionEvent({
            userId: user.user_id,
            entityType: "job",
            entityId: id,
            reasonId: validatedReasonId,
            metadata: {
              previous_status: prevStatus,
              new_status: row.status,
              source: "job_batch",
            },
          });
        } catch (e: unknown) {
          if ((e as { code?: string })?.code !== "42P01") throw e;
        }
      }

      results.push({ id, ok: true, updated: row as Record<string, unknown> });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error batch updating jobs", error);
    return NextResponse.json({ error: "Failed to batch update jobs" }, { status: 500 });
  }
}
