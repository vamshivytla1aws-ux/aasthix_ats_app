import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  try {
    const auth = await requirePermission("vendors.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const result = await query(
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
      WHERE vendors.created_by_user_id = $1
      ORDER BY created_at DESC NULLS LAST, id DESC
      `,
      [user.user_id]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Error fetching vendors", error);
    return NextResponse.json({ error: "Failed to fetch vendors" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("vendors.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const body = await request.json();
    const {
      name,
      industry = null,
      service_type = null,
      website = null,
      address = null,
      commercials = null,
      invoice_days = null,
      invoice_agreement = false,
      status = "Active",
      remarks = null,
    } = body ?? {};

    if (!name || String(name).trim().length === 0) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const result = await query(
      `
      INSERT INTO vendors (
        name, industry, service_type, website, address, commercials,
        invoice_days, invoice_agreement, status, remarks,
        website_url,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        String(name).trim(),
        industry,
        service_type,
        website,
        address,
        commercials,
        invoice_days,
        Boolean(invoice_agreement),
        status,
        remarks,
        website, // keep legacy column in sync for older code paths
        user.user_id,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (err: any) {
    console.error("Error creating vendor", err);
    return NextResponse.json(
      { error: err?.message || "Failed to create vendor" },
      { status: 500 }
    );
  }
}

