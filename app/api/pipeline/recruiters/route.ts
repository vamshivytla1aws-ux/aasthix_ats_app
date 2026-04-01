import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Users eligible as pipeline owner / assigned recruiter (for dropdowns). */
export async function GET() {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const res = await query(
      `SELECT id, full_name, email FROM users ORDER BY full_name ASC NULLS LAST, id ASC`
    );
    return NextResponse.json(res.rows);
  } catch (e) {
    console.error("GET /api/pipeline/recruiters", e);
    return NextResponse.json({ error: "Failed to load recruiters" }, { status: 500 });
  }
}
