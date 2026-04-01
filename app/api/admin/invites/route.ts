import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { generateInviteToken, hashInviteToken } from "@/lib/inviteToken";
import { writeAuditLog } from "@/lib/auditLog";
import { INVITE_ROLES } from "@/lib/rbacConstants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

function publicBaseUrl() {
  const u = process.env.APP_PUBLIC_URL?.trim();
  if (u) return u.replace(/\/$/, "");
  return "http://localhost:3000";
}

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const res = await query(
      `SELECT id, email, role, expires_at, created_at, accepted_at
       FROM user_invites
       ORDER BY created_at DESC
       LIMIT 100`
    );
    return NextResponse.json({ invites: res.rows });
  } catch (e) {
    console.error("admin invites GET", e);
    return NextResponse.json({ error: "Failed to list invites" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { email, role } = body as { email?: string; role?: string };

    if (!email?.trim()) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    const r = (role || "user").toLowerCase();
    if (!(INVITE_ROLES as readonly string[]).includes(r)) {
      return NextResponse.json(
        { error: `role must be one of: ${INVITE_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    const emailNorm = email.trim().toLowerCase();
    const existing = await query(`SELECT 1 FROM users WHERE email = $1`, [emailNorm]);
    if (existing.rowCount && existing.rowCount > 0) {
      return NextResponse.json({ error: "User with this email already exists" }, { status: 409 });
    }

    const raw = generateInviteToken();
    const tokenHash = hashInviteToken(raw);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await query(`DELETE FROM user_invites WHERE lower(email) = lower($1) AND accepted_at IS NULL`, [
      emailNorm,
    ]);

    await query(
      `INSERT INTO user_invites (email, token_hash, role, expires_at, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [emailNorm, tokenHash, r, expiresAt, auth.access.user_id]
    );

    const inviteUrl = `${publicBaseUrl()}/invite/accept?token=${encodeURIComponent(raw)}`;

    await writeAuditLog({
      actorUserId: auth.access.user_id,
      action: "auth.invite.created",
      metadata: { email: emailNorm, role: r },
    });

    if (process.env.NODE_ENV === "development") {
      console.log("[invite]", inviteUrl);
    }

    return NextResponse.json({ inviteUrl, expiresAt: expiresAt.toISOString() }, { status: 201 });
  } catch (e) {
    console.error("admin invites POST", e);
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}
