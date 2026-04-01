import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthAccess } from "@/lib/rbac";
import type { DispositionCategory } from "@/lib/dispositionAudit";

export const runtime = "nodejs";

const CATEGORIES: DispositionCategory[] = ["reject", "withdraw", "job_close"];

export async function GET(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const jobsOk = access.permissions["jobs.view"] !== false;
    const pipelineOk = access.permissions["pipeline.view"] !== false;
    if (!jobsOk && !pipelineOk) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const cat = (url.searchParams.get("category") || "").trim() as DispositionCategory | "";
    if (cat && !CATEGORIES.includes(cat)) {
      return NextResponse.json(
        { error: `category must be one of: ${CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    const params: unknown[] = [];
    let where = "WHERE active = TRUE";
    if (cat) {
      params.push(cat);
      where += ` AND category = $${params.length}`;
    }

    const result = await query(
      `
      SELECT id, code, label, category, sort_order
      FROM disposition_reasons
      ${where}
      ORDER BY category, sort_order ASC, id ASC
      `,
      params
    );

    return NextResponse.json({ reasons: result.rows });
  } catch (e) {
    console.error("disposition-reasons GET", e);
    const code = (e as { code?: string })?.code;
    if (code === "42P01") {
      return NextResponse.json(
        { error: "Disposition tables not migrated yet. Run migration 0038_disposition_audit.sql." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Failed to load disposition reasons" }, { status: 500 });
  }
}
