import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { INTEGRATIONS_V4_ENABLED } from "@/lib/featureFlags";
import { rotateWebhookSecret } from "@/lib/phase4/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!INTEGRATIONS_V4_ENABLED) return NextResponse.json({ enabled: false, secret: null });
  try {
    const body = await request.json().catch(() => ({}));
    const secret = await rotateWebhookSecret(typeof body?.secret_label === "string" ? body.secret_label : "default");
    return NextResponse.json({ enabled: true, secret });
  } catch (error) {
    console.error("POST /api/webhooks/rotate-secret", error);
    return NextResponse.json({ error: "Failed to rotate webhook secret" }, { status: 500 });
  }
}
