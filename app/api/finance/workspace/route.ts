import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { computeDashboardTotals, getWorkspace } from "@/lib/finance/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requirePermission("finance.view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const workspace = await getWorkspace();
    const dashboard = await computeDashboardTotals(workspace.id);
    return NextResponse.json({ workspace, dashboard });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load workspace" },
      { status: 500 }
    );
  }
}

