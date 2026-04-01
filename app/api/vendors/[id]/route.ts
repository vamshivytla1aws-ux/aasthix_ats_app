import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission("vendors.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const vendorId = Number(params.id);
    if (!Number.isFinite(vendorId)) {
      return NextResponse.json({ error: "Invalid vendor id" }, { status: 400 });
    }

    const vRes = await query(
      `
      SELECT
        id,
        name,
        industry,
        service_type,
        COALESCE(website, website_url) AS website,
        address,
        commercials,
        invoice_days,
        invoice_agreement,
        status,
        remarks,
        created_at
      FROM vendors
      WHERE id = $1 AND vendors.created_by_user_id = $2
      `,
      [vendorId, user.user_id]
    );
    const vendor = vRes.rows[0];
    if (!vendor) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const jobsRes = await query(
      `
      SELECT id, title, company, location, status, description, created_at
      FROM jobs
      WHERE jobs.created_by_user_id = $1 AND jobs.vendor_id = $2
      ORDER BY created_at DESC NULLS LAST, id DESC
      `,
      [user.user_id, vendorId]
    );

    const candidatesRes = await query(
      `
      SELECT
        a.id AS application_id,
        a.stage,
        a.updated_at,
        c.id AS candidate_id,
        c.full_name AS candidate_full_name,
        c.email AS candidate_email,
        j.id AS job_id,
        j.title AS job_title
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN candidates c ON c.id = a.candidate_id
      WHERE a.created_by_user_id = $1
        AND j.vendor_id = $2
      ORDER BY a.updated_at DESC NULLS LAST, a.id DESC
      `,
      [user.user_id, vendorId]
    );

    return NextResponse.json({
      vendor,
      jobs: jobsRes.rows,
      candidates_applied: candidatesRes.rows,
    });
  } catch (error) {
    console.error("Error fetching vendor detail", error);
    return NextResponse.json({ error: "Failed to fetch vendor detail" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission("vendors.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const vendorId = Number(params.id);
    if (!Number.isFinite(vendorId)) {
      return NextResponse.json({ error: "Invalid vendor id" }, { status: 400 });
    }

    const body = await request.json();
    const {
      name,
      industry,
      service_type,
      website,
      address,
      commercials,
      invoice_days,
      invoice_agreement,
      status,
      remarks,
    } = body ?? {};

    const result = await query(
      `
      UPDATE vendors
      SET
        name = COALESCE($1, name),
        industry = COALESCE($2, industry),
        service_type = COALESCE($3, service_type),
        website = COALESCE($4, website),
        address = COALESCE($5, address),
        commercials = COALESCE($6, commercials),
        invoice_days = COALESCE($7, invoice_days),
        invoice_agreement = COALESCE($8, invoice_agreement),
        status = COALESCE($9, status),
        remarks = COALESCE($10, remarks),
        website_url = COALESCE($4, website_url),
        updated_at = NOW()
      WHERE id = $11 AND vendors.created_by_user_id = $12
      RETURNING
        id,
        name,
        industry,
        service_type,
        COALESCE(website, website_url) AS website,
        address,
        commercials,
        invoice_days,
        invoice_agreement,
        status,
        remarks,
        created_at
      `,
      [
        typeof name === "string" ? name : null,
        typeof industry === "string" ? industry : null,
        typeof service_type === "string" ? service_type : null,
        typeof website === "string" ? website : null,
        typeof address === "string" ? address : null,
        typeof commercials === "string" ? commercials : null,
        typeof invoice_days === "string" ? invoice_days : null,
        typeof invoice_agreement === "boolean" ? invoice_agreement : null,
        typeof status === "string" ? status : null,
        typeof remarks === "string" ? remarks : null,
        vendorId,
        user.user_id,
      ]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating vendor", error);
    return NextResponse.json({ error: "Failed to update vendor" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission("vendors.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const vendorId = Number(params.id);
    if (!Number.isFinite(vendorId)) {
      return NextResponse.json({ error: "Invalid vendor id" }, { status: 400 });
    }

    const result = await query(
      `
      DELETE FROM vendors
      WHERE id = $1 AND vendors.created_by_user_id = $2
      `,
      [vendorId, user.user_id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting vendor", error);
    return NextResponse.json({ error: "Failed to delete vendor" }, { status: 500 });
  }
}

