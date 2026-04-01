import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { signAuthToken, tokenCookieName } from "@/lib/auth";
import { writeAuditLog } from "@/lib/auditLog";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }

    const result = await query(
      `SELECT id, email, full_name, password_hash FROM users WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const user = result.rows[0] as {
      id: number;
      email: string;
      full_name: string;
      password_hash: string | null;
    };

    if (!user.password_hash) {
      return NextResponse.json({ error: "Account not configured for password login" }, { status: 400 });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await signAuthToken({ user_id: user.id, email: user.email });

    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login",
      metadata: { email: user.email },
    });

    const res = NextResponse.json({ user: { id: user.id, email: user.email, full_name: user.full_name } });
    res.cookies.set(tokenCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (error) {
    console.error("Error logging in", error);
    return NextResponse.json({ error: "Failed to login" }, { status: 500 });
  }
}

