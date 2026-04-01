import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalRow = {
  id: number;
  job_id: number;
  requester_id: number;
  approver_id: number | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  notes: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  job_title?: string;
  job_status?: string;
  requester_email?: string;
  approver_email?: string;
};

// ─── GET: list approval requests (optionally filtered by job_id) ─────────────

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get("job_id");
    const statusFilter = searchParams.get("status");

    let sql = `
      SELECT
        ar.id, ar.job_id, ar.requester_id, ar.approver_id,
        ar.status, ar.notes, ar.decided_at, ar.created_at, ar.updated_at,
        j.title AS job_title, j.status AS job_status,
        req.email AS requester_email,
        appr.email AS approver_email
      FROM approval_requests ar
      JOIN jobs j ON j.id = ar.job_id AND j.created_by_user_id = $1
      JOIN users req ON req.id = ar.requester_id
      LEFT JOIN users appr ON appr.id = ar.approver_id
    `;
    const vals: unknown[] = [user.user_id];
    const wheres: string[] = [];

    if (jobId) {
      vals.push(Number(jobId));
      wheres.push(`ar.job_id = $${vals.length}`);
    }
    if (statusFilter && ["pending", "approved", "rejected", "cancelled"].includes(statusFilter)) {
      vals.push(statusFilter);
      wheres.push(`ar.status = $${vals.length}`);
    }
    if (wheres.length) sql += ` WHERE ${wheres.join(" AND ")}`;
    sql += ` ORDER BY ar.created_at DESC LIMIT 200`;

    const res = await query(sql, vals);
    return NextResponse.json({ approvals: res.rows });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "42P01") {
      return NextResponse.json({ approvals: [] });
    }
    console.error("Error listing approvals", e);
    return NextResponse.json({ error: "Failed to list approvals" }, { status: 500 });
  }
}

// ─── POST: submit a new approval request ─────────────────────────────────────
// Body: { job_id, approver_id?, notes? }
// Moves job status to "Pending Approval" if currently "Draft".

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const body = await request.json();
    const { job_id, approver_id, notes } = body as {
      job_id?: number;
      approver_id?: number;
      notes?: string;
    };

    if (!job_id || !Number.isFinite(job_id)) {
      return NextResponse.json({ error: "job_id is required" }, { status: 400 });
    }

    const jobRes = await query(
      `SELECT id, status FROM jobs WHERE id = $1 AND created_by_user_id = $2 LIMIT 1`,
      [job_id, user.user_id]
    );
    if (!jobRes.rowCount) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    const job = jobRes.rows[0] as { id: number; status: string };

    const existingPending = await query(
      `SELECT id FROM approval_requests WHERE job_id = $1 AND status = 'pending' LIMIT 1`,
      [job_id]
    );
    if (existingPending.rowCount && existingPending.rowCount > 0) {
      return NextResponse.json(
        { error: "An approval request is already pending for this job", code: "APPROVAL_ALREADY_PENDING" },
        { status: 409 }
      );
    }

    let validatedApproverId: number | null = null;
    if (approver_id && Number.isFinite(approver_id)) {
      const approverRes = await query(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [approver_id]);
      if (!approverRes.rowCount) {
        return NextResponse.json({ error: "Approver user not found" }, { status: 400 });
      }
      validatedApproverId = approver_id;
    }

    const insertRes = await query(
      `INSERT INTO approval_requests (job_id, requester_id, approver_id, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [job_id, user.user_id, validatedApproverId, notes?.trim() || null]
    );
    const approval = insertRes.rows[0] as ApprovalRow;

    if (job.status === "Draft" || job.status === "" || !job.status) {
      await query(
        `UPDATE jobs SET status = 'Pending Approval', updated_at = NOW() WHERE id = $1 AND created_by_user_id = $2`,
        [job_id, user.user_id]
      );
    }

    return NextResponse.json(approval, { status: 201 });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "42P01") {
      return NextResponse.json(
        { error: "approval_requests table not found — run migration 0039_approval_requests.sql" },
        { status: 500 }
      );
    }
    console.error("Error submitting approval", e);
    return NextResponse.json({ error: "Failed to submit approval" }, { status: 500 });
  }
}

// ─── PATCH: approve, reject, or cancel ───────────────────────────────────────
// Body: { id, action: "approve" | "reject" | "cancel", notes? }

export async function PATCH(request: Request) {
  try {
    const auth = await requirePermission("approvals.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const body = await request.json();
    const { id, action, notes } = body as {
      id?: number;
      action?: "approve" | "reject" | "cancel";
      notes?: string;
    };

    if (!id || !Number.isFinite(id)) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (!action || !["approve", "reject", "cancel"].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "approve", "reject", or "cancel"', code: "INVALID_APPROVAL_ACTION" },
        { status: 400 }
      );
    }

    const arRes = await query(
      `SELECT ar.*, j.status AS job_status, j.created_by_user_id AS job_owner_id
       FROM approval_requests ar
       JOIN jobs j ON j.id = ar.job_id
       WHERE ar.id = $1 LIMIT 1`,
      [id]
    );
    if (!arRes.rowCount) {
      return NextResponse.json({ error: "Approval request not found" }, { status: 404 });
    }
    const ar = arRes.rows[0] as ApprovalRow & { job_owner_id: number };

    if (ar.status !== "pending") {
      return NextResponse.json(
        {
          error: `Cannot ${action} — request is already "${ar.status}"`,
          code: "APPROVAL_NOT_PENDING",
        },
        { status: 400 }
      );
    }

    if (action === "cancel") {
      if (ar.requester_id !== user.user_id && user.role !== "admin") {
        return NextResponse.json({ error: "Only the requester or admin can cancel" }, { status: 403 });
      }
    }

    const newStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "cancelled";

    const updateRes = await query(
      `UPDATE approval_requests
       SET status = $1, approver_id = $2, notes = COALESCE($3, notes), decided_at = NOW(), updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [newStatus, user.user_id, notes?.trim() || null, id]
    );
    const updated = updateRes.rows[0] as ApprovalRow;

    if (action === "approve") {
      await query(
        `UPDATE jobs SET status = 'Open', updated_at = NOW()
         WHERE id = $1 AND created_by_user_id = $2`,
        [ar.job_id, ar.job_owner_id]
      );
    } else if (action === "reject") {
      await query(
        `UPDATE jobs SET status = 'Draft', updated_at = NOW()
         WHERE id = $1 AND created_by_user_id = $2`,
        [ar.job_id, ar.job_owner_id]
      );
    } else if (action === "cancel") {
      await query(
        `UPDATE jobs SET status = 'Draft', updated_at = NOW()
         WHERE id = $1 AND created_by_user_id = $2 AND status = 'Pending Approval'`,
        [ar.job_id, ar.job_owner_id]
      );
    }

    return NextResponse.json(updated);
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "42P01") {
      return NextResponse.json(
        { error: "approval_requests table not found — run migration 0039_approval_requests.sql" },
        { status: 500 }
      );
    }
    console.error("Error updating approval", e);
    return NextResponse.json({ error: "Failed to update approval" }, { status: 500 });
  }
}
