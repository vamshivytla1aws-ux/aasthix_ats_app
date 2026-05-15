import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/rbac";
import { INTEGRATIONS_V4_ENABLED } from "@/lib/featureFlags";
import { createConnector, listConnectors } from "@/lib/phase4/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!INTEGRATIONS_V4_ENABLED) {
    return NextResponse.json({
      enabled: false,
      connectors: [],
      operation_status: "blocked",
      health_status: "blocked",
      user_message: "Integrations are disabled by flag.",
      trace_id: `integrations-connectors-${Date.now()}`,
    });
  }
  try {
    const connectors = await listConnectors();
    return NextResponse.json({
      enabled: true,
      connectors,
      operation_status: "success",
      health_status: connectors.some((c) => c.status === "failed") ? "warning" : "healthy",
      last_evaluated_at: new Date().toISOString(),
      owner: "integration-admin",
      trace_id: `integrations-connectors-${Date.now()}`,
    });
  } catch (error) {
    console.error("GET /api/integrations/connectors", error);
    return NextResponse.json({ error: "Failed to load connectors" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!INTEGRATIONS_V4_ENABLED) {
    return NextResponse.json({
      enabled: false,
      connector: null,
      operation_status: "blocked",
      health_status: "blocked",
      user_message: "Integrations are disabled by flag.",
      trace_id: `integrations-connectors-create-${Date.now()}`,
    });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const connector = await createConnector({
      connector_type: String(body?.connector_type || "hris"),
      name: String(body?.name || "Integration Connector"),
      status: String(body?.status || "active"),
      config: body?.config && typeof body.config === "object" ? body.config : {},
      vault_ref: typeof body?.vault_ref === "string" ? body.vault_ref : null,
    });
    return NextResponse.json({
      enabled: true,
      connector,
      operation_status: "success",
      health_status: "healthy",
      user_message: "Connector created.",
      last_evaluated_at: new Date().toISOString(),
      owner: "integration-admin",
      trace_id: `integrations-connectors-create-${Date.now()}`,
    });
  } catch (error) {
    console.error("POST /api/integrations/connectors", error);
    return NextResponse.json({ error: "Failed to create connector" }, { status: 500 });
  }
}
