import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import {
  jobStatusRequiresDispositionReason,
  recordDispositionEvent,
  validateDispositionReason,
} from "@/lib/dispositionAudit";
import { validateStatusTransition } from "@/lib/jobStatusTransitions";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    const result = await query(
      `
      SELECT
        j.id,
        j.title,
        j.company,
        j.location,
        j.status,
        j.open_positions,
        j.employment_type,
        j.experience_requirement,
        j.description,
        j.created_at,
        j.vendor_id,
        v.name AS vendor_name
      FROM jobs j
      LEFT JOIN vendors v ON v.id = j.vendor_id
      WHERE j.id = $1
      LIMIT 1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching job", error);
    return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    const body = await request.json();
    const {
      title,
      company,
      location,
      status = "Open",
      description = null,
      vendor_id = null,
      open_positions = 1,
      employment_type = "Full Time",
      experience_requirement = null,
      disposition_reason_id,
    } = body ?? {};
    if (!title || !company || !location) {
      return NextResponse.json({ error: "title, company and location are required" }, { status: 400 });
    }
    const positions = Number(open_positions);
    if (!Number.isFinite(positions) || positions < 1) {
      return NextResponse.json({ error: "open_positions must be at least 1" }, { status: 400 });
    }

    const prevPut = await query(`SELECT status FROM jobs WHERE id = $1 LIMIT 1`, [id]);
    if (prevPut.rowCount === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    const prevStatusPut = String((prevPut.rows[0] as { status: string }).status || "");
    const newStatusPut = String(status || "Open").trim();
    const statusChangingPut = newStatusPut !== prevStatusPut;

    if (statusChangingPut) {
      const tv = validateStatusTransition(prevStatusPut, newStatusPut);
      if (!tv.ok) {
        return NextResponse.json(
          { error: tv.message, code: tv.code, from: tv.from, to: tv.to, allowed: tv.allowed },
          { status: 400 }
        );
      }
    }

    const needsDispositionPut =
      statusChangingPut && jobStatusRequiresDispositionReason(newStatusPut);
    let validatedPutReasonId: number | null = null;
    if (needsDispositionPut) {
      const rid = Number(disposition_reason_id);
      if (!Number.isFinite(rid) || rid <= 0) {
        return NextResponse.json(
          {
            error:
              "disposition_reason_id is required when setting job status to Closed, Filled, or On Hold",
          },
          { status: 400 }
        );
      }
      const v = await validateDispositionReason(rid, ["job_close"]);
      if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
      validatedPutReasonId = rid;
    }

    const result = await query(
      `
      UPDATE jobs
      SET
        title = $1,
        company = $2,
        location = $3,
        status = $4,
        description = $5,
        vendor_id = $6,
        open_positions = $7,
        employment_type = $8,
        experience_requirement = $9
      WHERE id = $10
      RETURNING id, title, company, location, status, open_positions, employment_type, experience_requirement, description, created_at, vendor_id
      `,
      [
        title,
        company,
        location,
        status,
        description,
        vendor_id,
        Math.trunc(positions),
        String(employment_type || "Full Time"),
        typeof experience_requirement === "string" ? experience_requirement : null,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const putRow = result.rows[0] as { status: string };
    if (needsDispositionPut && validatedPutReasonId !== null) {
      try {
        await recordDispositionEvent({
          userId: user.user_id,
          entityType: "job",
          entityId: id,
          reasonId: validatedPutReasonId,
          metadata: { previous_status: prevStatusPut, new_status: putRow.status, source: "job_put" },
        });
      } catch (e: any) {
        if (e?.code !== "42P01") throw e;
      }
    }

    return NextResponse.json(putRow);
  } catch (error) {
    console.error("Error updating job", error);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}

/** Partial update (e.g. inline status from jobs table). */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    const body = await request.json();
    const { status, open_positions, disposition_reason_id } = body as {
      status?: string;
      open_positions?: number;
      disposition_reason_id?: number;
    };

    const prevRes = await query(`SELECT status FROM jobs WHERE id = $1 LIMIT 1`, [id]);
    if (prevRes.rowCount === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    const prevStatus = String((prevRes.rows[0] as { status: string }).status || "");

    const newStatusTrimmed = typeof status === "string" && status.trim() ? status.trim() : null;
    const statusChanging = newStatusTrimmed !== null && newStatusTrimmed !== prevStatus;

    if (statusChanging && newStatusTrimmed !== null) {
      const tv = validateStatusTransition(prevStatus, newStatusTrimmed);
      if (!tv.ok) {
        return NextResponse.json(
          { error: tv.message, code: tv.code, from: tv.from, to: tv.to, allowed: tv.allowed },
          { status: 400 }
        );
      }
    }

    const needsDisposition =
      statusChanging && newStatusTrimmed !== null && jobStatusRequiresDispositionReason(newStatusTrimmed);

    let validatedJobCloseReasonId: number | null = null;
    if (needsDisposition) {
      const rid = Number(disposition_reason_id);
      if (!Number.isFinite(rid) || rid <= 0) {
        return NextResponse.json(
          {
            error:
              "disposition_reason_id is required when setting job status to Closed, Filled, or On Hold",
          },
          { status: 400 }
        );
      }
      const v = await validateDispositionReason(rid, ["job_close"]);
      if (!v.ok) {
        return NextResponse.json({ error: v.error }, { status: 400 });
      }
      validatedJobCloseReasonId = rid;
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (newStatusTrimmed !== null) {
      vals.push(newStatusTrimmed);
      sets.push(`status = $${vals.length}`);
    }
    if (open_positions !== undefined && open_positions !== null) {
      const p = Number(open_positions);
      if (Number.isFinite(p) && p >= 1) {
        vals.push(Math.trunc(p));
        sets.push(`open_positions = $${vals.length}`);
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    vals.push(id);
    const idPh = `$${vals.length}`;

    const result = await query(
      `
      UPDATE jobs
      SET ${sets.join(", ")}, updated_at = NOW()
      WHERE id = ${idPh}
      RETURNING id, title, company, location, status, open_positions, employment_type, experience_requirement, description, created_at, vendor_id
      `,
      vals
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const row = result.rows[0] as { status: string };
    if (needsDisposition && validatedJobCloseReasonId !== null) {
      try {
        await recordDispositionEvent({
          userId: user.user_id,
          entityType: "job",
          entityId: id,
          reasonId: validatedJobCloseReasonId,
          metadata: { previous_status: prevStatus, new_status: row.status, source: "job_patch" },
        });
      } catch (e: any) {
        if (e?.code !== "42P01") throw e;
      }
    }

    return NextResponse.json(row);
  } catch (error) {
    console.error("Error patching job", error);
    return NextResponse.json({ error: "Failed to update job" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Invalid job id" }, { status: 400 });
    }

    const result = await query(
      `
      DELETE FROM jobs
      WHERE id = $1
      RETURNING id
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting job", error);
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
  }
}

