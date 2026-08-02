import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { jobAccessPredicate } from "@/lib/dataScope";

export async function GET() {
  try {
    const auth = await requirePermission("jobs.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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
      WHERE ${jobAccessPredicate("j", "$1")}
      ORDER BY j.created_at DESC NULLS LAST, j.id DESC
      `,
      [auth.access.user_id]
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Error fetching jobs", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

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
    } = body;
    const positions = Number(open_positions);
    if (!Number.isFinite(positions) || positions < 1) {
      return NextResponse.json({ error: "open_positions must be at least 1" }, { status: 400 });
    }

    const result = await query(
      `
      INSERT INTO jobs (title, company, location, status, description, vendor_id, open_positions, employment_type, experience_requirement, created_by_user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        user.user_id,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Error creating job", error);
    return NextResponse.json(
      { error: "Failed to create job" },
      { status: 500 }
    );
  }
}
