import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthAccess } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/settings/profile
 * Update current user's profile. Body: { full_name: string }
 */
export async function PATCH(request: Request) {
  try {
    const access = await getAuthAccess();
    if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const fullName = (body.full_name || "").trim();

    if (!fullName || fullName.length < 1) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (fullName.length > 200) {
      return NextResponse.json({ error: "Name too long" }, { status: 400 });
    }

    await query(
      `UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2`,
      [fullName, access.user_id]
    );

    return NextResponse.json({ ok: true, full_name: fullName });
  } catch (error) {
    console.error("settings/profile PATCH", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
