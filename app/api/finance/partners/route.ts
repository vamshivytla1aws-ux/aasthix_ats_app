import { NextResponse } from "next/server";
import { createPartner, getWorkspace, listPartners, updatePartner } from "@/lib/finance/service";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requirePermission("finance.view");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const workspace = await getWorkspace();
    const partners = await listPartners(workspace.id);
    return NextResponse.json({ partners });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await requirePermission("finance.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = (await request.json()) as {
      name: string;
      email?: string | null;
      roleLabel?: string | null;
      joinedAt?: string | null;
    };
    const workspace = await getWorkspace();
    const partner = await createPartner({
      workspaceId: workspace.id,
      name: body.name,
      email: body.email,
      roleLabel: body.roleLabel,
      joinedAt: body.joinedAt ?? null,
    });
    return NextResponse.json({ partner });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const access = await requirePermission("finance.manage");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  try {
    const body = (await request.json()) as {
      id: number;
      name: string;
      email?: string | null;
      roleLabel?: string | null;
      isActive?: boolean;
    };
    const workspace = await getWorkspace();
    const partner = await updatePartner({
      id: body.id,
      workspaceId: workspace.id,
      name: body.name,
      email: body.email,
      roleLabel: body.roleLabel,
      isActive: body.isActive,
    });
    return NextResponse.json({ partner });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 400 });
  }
}

