import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { signAuthToken, tokenCookieName } from "@/lib/auth";
import { isOpenSignupAllowed } from "@/lib/authSignupPolicy";
import { writeAuditLog } from "@/lib/auditLog";

export async function POST(request: Request) {
  try {
    if (!isOpenSignupAllowed()) {
      return NextResponse.json(
        { error: "Self-service signup is disabled. Ask an administrator for an invite." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { full_name, email, password } = body as {
      full_name?: string;
      email?: string;
      password?: string;
    };

    if (!full_name || !email || !password) {
      return NextResponse.json(
        { error: "full_name, email, and password are required" },
        { status: 400 }
      );
    }

    const password_hash = await bcrypt.hash(password, 12);

    const result = await query(
      `
      INSERT INTO users (full_name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, full_name, email
      `,
      [full_name.trim(), email.trim().toLowerCase(), password_hash]
    );

    const user = result.rows[0] as { id: number; email: string; full_name: string };
    const token = await signAuthToken({ user_id: user.id, email: user.email });

    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.signup",
      metadata: { email: user.email },
    });

    const res = NextResponse.json({ user }, { status: 201 });
    res.cookies.set(tokenCookieName(), token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (error: any) {
    // Unique violation
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    console.error("Error signing up", error);
    return NextResponse.json({ error: "Failed to signup" }, { status: 500 });
  }
}

