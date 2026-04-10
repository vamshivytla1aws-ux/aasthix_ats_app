import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthAccess } from "@/lib/rbac";

export const runtime = "nodejs";

const PAGES = new Set(["pipeline", "candidates", "jobs"]);

export async function GET(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = access;

    const url = new URL(request.url);
    const page = (url.searchParams.get("page") ?? "pipeline").trim();
    if (!PAGES.has(page)) {
      return NextResponse.json({ error: "page must be pipeline, candidates, or jobs" }, { status: 400 });
    }

    const res = await query(
      `
      SELECT id, page, name, filters, sort_order, created_at, updated_at
      FROM user_saved_views
      WHERE user_id = $1 AND page = $2
      ORDER BY sort_order ASC, id ASC
      `,
      [user.user_id, page]
    );

    return NextResponse.json({ views: res.rows });
  } catch (e: any) {
    if (e?.code === "42P01") return NextResponse.json({ views: [] });
    console.error("saved-views GET", e);
    return NextResponse.json({ error: "Failed to load views" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = access;

    const body = await request.json();
    const page = String(body?.page ?? "pipeline").trim();
    const name = String(body?.name ?? "").trim().slice(0, 120);
    const filters = body?.filters && typeof body.filters === "object" ? body.filters : {};

    if (!PAGES.has(page)) {
      return NextResponse.json({ error: "page must be pipeline, candidates, or jobs" }, { status: 400 });
    }
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const res = await query(
      `
      INSERT INTO user_saved_views (user_id, page, name, filters, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, NOW())
      ON CONFLICT (user_id, page, name)
      DO UPDATE SET filters = EXCLUDED.filters, updated_at = NOW()
      RETURNING id, page, name, filters, sort_order, created_at, updated_at
      `,
      [user.user_id, page, name, JSON.stringify(filters)]
    );

    return NextResponse.json({ view: res.rows[0] });
  } catch (e: any) {
    if (e?.code === "42P01") {
      return NextResponse.json({ error: "Run migrations to enable saved views" }, { status: 400 });
    }
    console.error("saved-views POST", e);
    return NextResponse.json({ error: "Failed to save view" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = access;

    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "id query param required" }, { status: 400 });
    }

    const del = await query(`DELETE FROM user_saved_views WHERE id = $1 AND user_id = $2 RETURNING id`, [
      id,
      user.user_id,
    ]);
    if (del.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.code === "42P01") {
      return NextResponse.json({ error: "Run migrations to enable saved views" }, { status: 400 });
    }
    console.error("saved-views DELETE", e);
    return NextResponse.json({ error: "Failed to delete view" }, { status: 500 });
  }
}
