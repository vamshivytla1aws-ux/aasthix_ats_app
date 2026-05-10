import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { INTEGRATIONS_V4_ENABLED } from "@/lib/featureFlags";
import { updateConnector } from "@/lib/phase4/service";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!INTEGRATIONS_V4_ENABLED) return NextResponse.json({ enabled: false, connector: null });
  return NextResponse.json({ enabled: true, id: Number(params.id) });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!INTEGRATIONS_V4_ENABLED) return NextResponse.json({ enabled: false, connector: null });
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Invalid connector id" }, { status: 400 });
  try {
    const body = await request.json().catch(() => ({}));
    const connector = await updateConnector(id, {
      status: typeof body?.status === "string" ? body.status : undefined,
      config: body?.config && typeof body.config === "object" ? body.config : undefined,
      vault_ref: typeof body?.vault_ref === "string" ? body.vault_ref : undefined,
      health: body?.health && typeof body.health === "object" ? body.health : undefined,
    });
    return NextResponse.json({ enabled: true, connector });
  } catch (error) {
    console.error("PUT /api/integrations/connectors/:id", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update connector" }, { status: 500 });
  }
}
