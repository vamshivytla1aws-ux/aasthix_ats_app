import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { applicationAccessPredicate, hasJobTeamTable } from "@/lib/applicationVisibility";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  try {
    const auth = await requirePermission("pipeline.manage");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const user = auth.access;

    const rawId = context.params.id;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid application id" }, { status: 400 });
    }

    const hasTeam = await hasJobTeamTable();
    const access = applicationAccessPredicate("applications", "$2", hasTeam);

    const del = await query(
      `DELETE FROM applications WHERE id = $1 AND (${access}) RETURNING id`,
      [id, user.user_id]
    );

    if (del.rowCount === 0) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error("DELETE /api/applications/[id]", e);
    return NextResponse.json({ error: "Failed to remove application" }, { status: 500 });
  }
}
