import { NextResponse } from "next/server";
import { getWorkspace, importStateSnapshot } from "@/lib/finance/service";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await requirePermission("finance.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = (await request.json()) as { payload: Record<string, unknown> };
    const workspace = await getWorkspace();
    const result = await importStateSnapshot({
      workspaceId: workspace.id,
      createdByUserId: access.access.user_id,
      payload: body.payload ?? {},
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 400 });
  }
}

