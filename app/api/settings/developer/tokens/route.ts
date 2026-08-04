import { NextResponse } from "next/server";
import { getAuthAccess } from "@/lib/rbac";
import { query } from "@/lib/db";
import { generateNewPat } from "@/lib/pat";

export const runtime = "nodejs";

export async function GET() {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const res = await query(
      `SELECT id, name, expires_at, last_used_at, created_at 
       FROM personal_access_tokens 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [access.user_id]
    );
    return NextResponse.json({ tokens: res.rows });
  } catch (err) {
    return NextResponse.json({ error: "Failed to list tokens" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "Token name required" }, { status: 400 });
    
    // Default expiry 90 days for now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);
    
    const { token, token_hash } = generateNewPat();
    
    const res = await query(
      `INSERT INTO personal_access_tokens (user_id, name, token_hash, expires_at, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, name, expires_at, created_at`,
      [access.user_id, name, token_hash, expiresAt.toISOString()]
    );
    
    return NextResponse.json({ 
      token: res.rows[0],
      secret: token // Only returned ONCE!
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to create token" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "Token ID required" }, { status: 400 });
    
    await query(`DELETE FROM personal_access_tokens WHERE id = $1 AND user_id = $2`, [id, access.user_id]);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to delete token" }, { status: 500 });
  }
}
