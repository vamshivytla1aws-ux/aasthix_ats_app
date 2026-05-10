import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { AUTOMATION_V3_ENABLED } from "@/lib/featureFlags";
import { listAutomationRules } from "@/lib/phase3/automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePermission("jobs.view");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!AUTOMATION_V3_ENABLED) return NextResponse.json({ enabled: false, rules: [] });
  try {
    const rules = await listAutomationRules();
    return NextResponse.json({ enabled: true, rules });
  } catch (error) {
    console.error("GET /api/automation/rules", error);
    return NextResponse.json({ error: "Failed to load automation rules" }, { status: 500 });
  }
}
