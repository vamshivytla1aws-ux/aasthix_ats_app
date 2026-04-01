import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { pool, query } from "@/lib/db";
import { signAuthToken, tokenCookieName } from "@/lib/auth";
import { hashInviteToken } from "@/lib/inviteToken";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token, password, full_name } = body as {
      token?: string;
      password?: string;
      full_name?: string;
    };

    if (!token || !password || !full_name?.trim()) {
      return NextResponse.json(
        { error: "token, password, and full_name are required" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const tokenHash = hashInviteToken(token.trim());
    const invRes = await query(
      `SELECT id, email, role, expires_at, accepted_at
       FROM user_invites
       WHERE token_hash = $1`,
      [tokenHash]
    );

    if (invRes.rowCount === 0) {
      return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
    }

    const inv = invRes.rows[0] as {
      id: number;
      email: string;
      role: string;
      expires_at: Date;
      accepted_at: Date | null;
    };

    if (inv.accepted_at) {
      return NextResponse.json({ error: "Invite already used" }, { status: 400 });
    }
    if (new Date(inv.expires_at) < new Date()) {
      return NextResponse.json({ error: "Invite expired" }, { status: 400 });
    }

    const email = inv.email.trim().toLowerCase();
    const exists = await query(`SELECT 1 FROM users WHERE email = $1`, [email]);
    if (exists.rowCount && exists.rowCount > 0) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const client = await pool.connect();
    let user: { id: number; email: string; full_name: string };
    try {
      await client.query("BEGIN");
      const userRes = await client.query(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, full_name`,
        [full_name.trim(), email, password_hash, inv.role]
      );
      user = userRes.rows[0] as { id: number; email: string; full_name: string };

      await client.query(`UPDATE user_invites SET accepted_at = NOW() WHERE id = $1`, [inv.id]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    const jwt = await signAuthToken({ user_id: user.id, email: user.email });
    const res = NextResponse.json({ user }, { status: 201 });
    res.cookies.set(tokenCookieName(), jwt, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.invite.accepted",
      metadata: { email, invite_id: inv.id },
    });

    return res;
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "23505") {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    console.error("accept-invite", error);
    return NextResponse.json({ error: "Failed to accept invite" }, { status: 500 });
  }
}
