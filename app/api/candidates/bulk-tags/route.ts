import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";

/**
 * POST { candidate_ids: number[], add_tags: string[] }
 * Appends unique tags to candidates.domain_tags (deduped).
 */
export async function POST(request: Request) {
  try {
    const auth = await requirePermission("candidates.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const body = await request.json();
    const raw = Array.isArray(body?.candidate_ids) ? body.candidate_ids : [];
    const ids: number[] = Array.from(
      new Set(
        raw
          .map((x: unknown) => Number(x))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      )
    );
    const tagsIn = Array.isArray(body?.add_tags) ? body.add_tags : [];
    const tags = tagsIn
      .map((t: unknown) => String(t || "").trim())
      .filter(Boolean)
      .slice(0, 50)
      .map((t: string) => t.slice(0, 80));

    if (ids.length === 0) return NextResponse.json({ error: "candidate_ids required" }, { status: 400 });
    if (ids.length > 200) return NextResponse.json({ error: "Too many candidates" }, { status: 400 });
    if (tags.length === 0) return NextResponse.json({ error: "add_tags required" }, { status: 400 });

    const isAdmin = user.role === "admin";

    const upd = isAdmin
      ? await query(
          `
          UPDATE candidates c
          SET domain_tags = ARRAY(
            SELECT DISTINCT unnest(COALESCE(c.domain_tags, ARRAY[]::text[]) || $1::text[])
          ),
          updated_at = NOW()
          WHERE c.id = ANY($2::bigint[])
          `,
          [tags, ids]
        )
      : await query(
          `
          UPDATE candidates c
          SET domain_tags = ARRAY(
            SELECT DISTINCT unnest(COALESCE(c.domain_tags, ARRAY[]::text[]) || $1::text[])
          ),
          updated_at = NOW()
          WHERE c.id = ANY($3::bigint[])
            AND c.created_by_user_id = $2
          `,
          [tags, user.user_id, ids]
        );

    return NextResponse.json({ ok: true, updated: upd.rowCount ?? 0 });
  } catch (e: any) {
    if (e?.code === "42703") {
      return NextResponse.json({ error: "domain_tags column missing — run migrations" }, { status: 400 });
    }
    console.error("candidates/bulk-tags", e);
    return NextResponse.json({ error: "Bulk tag failed" }, { status: 500 });
  }
}
