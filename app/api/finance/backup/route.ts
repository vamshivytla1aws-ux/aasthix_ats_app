import { NextResponse } from "next/server";
import { exportFinanceBackup, getWorkspace } from "@/lib/finance/service";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requirePermission("finance.view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const workspace = await getWorkspace();
    const backup = await exportFinanceBackup(workspace.id);
    return NextResponse.json({ backup });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
