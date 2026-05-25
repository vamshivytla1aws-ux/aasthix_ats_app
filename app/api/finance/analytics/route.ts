import { NextResponse } from "next/server";
import { buildAnalytics, getWorkspace } from "@/lib/finance/service";
import { requirePermission } from "@/lib/rbac";
import type { FinanceRangeInput } from "@/lib/finance/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const access = await requirePermission("finance.view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const url = new URL(request.url);
    const range: FinanceRangeInput = {
      preset: (url.searchParams.get("preset") as FinanceRangeInput["preset"]) ?? "full",
      month: url.searchParams.get("month") ?? undefined,
      year: url.searchParams.get("year") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    };
    const workspace = await getWorkspace();
    const analytics = await buildAnalytics(workspace.id, range);
    return NextResponse.json({ analytics });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
