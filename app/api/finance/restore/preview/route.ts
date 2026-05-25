import { NextResponse } from "next/server";
import { previewRestoreBackup } from "@/lib/finance/service";
import { requirePermission } from "@/lib/rbac";
import type { FinanceBackupPayload } from "@/lib/finance/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await requirePermission("finance.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = (await request.json()) as { backup: FinanceBackupPayload };
    const preview = previewRestoreBackup(body.backup);
    return NextResponse.json({ preview });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid backup payload" }, { status: 400 });
  }
}
