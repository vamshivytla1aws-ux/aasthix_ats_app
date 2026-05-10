import { NextResponse } from "next/server";
import { getAuthAccess } from "@/lib/rbac";
import { getWorkspacePreferences, updateWorkspacePreferences } from "@/lib/workspace/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const preferences = await getWorkspacePreferences(access.user_id);
    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("GET /api/workspace/preferences", error);
    return NextResponse.json({ error: "Failed to load workspace preferences" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const preferences = await updateWorkspacePreferences(access.user_id, body ?? {});
    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("PUT /api/workspace/preferences", error);
    return NextResponse.json({ error: "Failed to update workspace preferences" }, { status: 500 });
  }
}
