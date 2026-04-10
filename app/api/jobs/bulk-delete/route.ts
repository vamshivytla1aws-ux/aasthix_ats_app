import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IDS = 200;

/**
 * POST /api/jobs/bulk-delete
 * Body: { ids: number[] }
 * Deletes jobs the caller could remove individually (same rules as DELETE /api/jobs/[id]).
 */
export async function POST(request: Request) {
  try {
    const auth = await requirePermission("jobs.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const raw = body && typeof body === "object" && "ids" in body ? (body as { ids?: unknown }).ids : undefined;
    const ids = Array.isArray(raw)
      ? [...new Set(raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))].slice(0, MAX_IDS)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Provide a non-empty ids array" }, { status: 400 });
    }

    const result = await query(
      `DELETE FROM jobs WHERE id = ANY($1::bigint[]) RETURNING id`,
      [ids]
    );

    const deletedIds = (result.rows as { id: string | number }[]).map((r) => Number(r.id));

    return NextResponse.json({
      success: true,
      deleted_count: deletedIds.length,
      deleted_ids: deletedIds,
      requested_count: ids.length,
    });
  } catch (error) {
    console.error("bulk-delete jobs", error);
    return NextResponse.json({ error: "Failed to delete jobs" }, { status: 500 });
  }
}
