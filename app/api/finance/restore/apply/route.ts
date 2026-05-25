import { NextResponse } from "next/server";
import { applyRestoreBackup, getWorkspace } from "@/lib/finance/service";
import { requirePermission } from "@/lib/rbac";
import type { FinanceBackupPayload } from "@/lib/finance/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await requirePermission("finance.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = (await request.json()) as { backup: FinanceBackupPayload };
    const workspace = await getWorkspace();
    const result = await applyRestoreBackup({
      workspaceId: workspace.id,
      payload: body.backup,
      createdByUserId: access.access.user_id,
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Restore failed" }, { status: 400 });
  }
}
