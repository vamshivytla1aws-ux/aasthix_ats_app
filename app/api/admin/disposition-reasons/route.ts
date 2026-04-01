import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthAccess } from "@/lib/rbac";
import type { DispositionCategory } from "@/lib/dispositionAudit";

const CATEGORIES: DispositionCategory[] = ["reject", "withdraw", "job_close"];

function hasAdminOrManage(access: { role: string; permissions: Record<string, boolean> }) {
  return access.role === "admin" || access.permissions["jobs.manage"] === true;
}

// ─── GET: all reasons (including inactive) for admin management ──────────────

export async function GET(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasAdminOrManage(access)) {
      return NextResponse.json({ error: "Forbidden — admin or jobs.manage required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const cat = searchParams.get("category")?.trim() as DispositionCategory | "" | undefined;

    const vals: unknown[] = [];
    const wheres: string[] = [];
    if (cat && CATEGORIES.includes(cat as DispositionCategory)) {
      vals.push(cat);
      wheres.push(`category = $${vals.length}`);
    }

    const whereClause = wheres.length > 0 ? `WHERE ${wheres.join(" AND ")}` : "";
    const result = await query(
      `SELECT id, code, label, category, sort_order, active, created_at
       FROM disposition_reasons
       ${whereClause}
       ORDER BY category, sort_order ASC, id ASC`,
      vals
    );

    return NextResponse.json({ reasons: result.rows });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "42P01") {
      return NextResponse.json({ reasons: [] });
    }
    console.error("admin disposition-reasons GET", e);
    return NextResponse.json({ error: "Failed to load reasons" }, { status: 500 });
  }
}

// ─── POST: create a new custom disposition reason ────────────────────────────
// Body: { code, label, category, sort_order? }

export async function POST(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasAdminOrManage(access)) {
      return NextResponse.json({ error: "Forbidden — admin or jobs.manage required" }, { status: 403 });
    }

    const body = await request.json();
    const { code, label, category, sort_order } = body as {
      code?: string;
      label?: string;
      category?: string;
      sort_order?: number;
    };

    const trimCode = code?.trim();
    const trimLabel = label?.trim();

    if (!trimCode || !trimLabel) {
      return NextResponse.json({ error: "code and label are required" }, { status: 400 });
    }
    if (!/^[a-z0-9_]+$/.test(trimCode)) {
      return NextResponse.json(
        { error: "code must be lowercase alphanumeric with underscores only" },
        { status: 400 }
      );
    }
    if (!category || !CATEGORIES.includes(category as DispositionCategory)) {
      return NextResponse.json(
        { error: `category must be one of: ${CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    const sortVal = Number.isFinite(sort_order) ? sort_order : 500;

    const res = await query(
      `INSERT INTO disposition_reasons (code, label, category, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id, code, label, category, sort_order, active, created_at`,
      [trimCode, trimLabel, category, sortVal]
    );

    return NextResponse.json(res.rows[0], { status: 201 });
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "23505") {
      return NextResponse.json({ error: "A reason with that code already exists" }, { status: 409 });
    }
    if ((e as { code?: string })?.code === "42P01") {
      return NextResponse.json(
        { error: "disposition_reasons table not found — run migration 0038" },
        { status: 500 }
      );
    }
    console.error("admin disposition-reasons POST", e);
    return NextResponse.json({ error: "Failed to create reason" }, { status: 500 });
  }
}

// ─── PATCH: toggle active, update label/sort_order ───────────────────────────
// Body: { id, active?, label?, sort_order? }

export async function PATCH(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasAdminOrManage(access)) {
      return NextResponse.json({ error: "Forbidden — admin or jobs.manage required" }, { status: 403 });
    }

    const body = await request.json();
    const { id, active, label, sort_order } = body as {
      id?: number;
      active?: boolean;
      label?: string;
      sort_order?: number;
    };

    if (!id || !Number.isFinite(id)) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const sets: string[] = [];
    const vals: unknown[] = [];

    if (typeof active === "boolean") {
      vals.push(active);
      sets.push(`active = $${vals.length}`);
    }
    if (typeof label === "string" && label.trim()) {
      vals.push(label.trim());
      sets.push(`label = $${vals.length}`);
    }
    if (typeof sort_order === "number" && Number.isFinite(sort_order)) {
      vals.push(sort_order);
      sets.push(`sort_order = $${vals.length}`);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    vals.push(id);
    const res = await query(
      `UPDATE disposition_reasons
       SET ${sets.join(", ")}
       WHERE id = $${vals.length}
       RETURNING id, code, label, category, sort_order, active, created_at`,
      vals
    );

    if (!res.rowCount) {
      return NextResponse.json({ error: "Reason not found" }, { status: 404 });
    }

    return NextResponse.json(res.rows[0]);
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "42P01") {
      return NextResponse.json(
        { error: "disposition_reasons table not found — run migration 0038" },
        { status: 500 }
      );
    }
    console.error("admin disposition-reasons PATCH", e);
    return NextResponse.json({ error: "Failed to update reason" }, { status: 500 });
  }
}
