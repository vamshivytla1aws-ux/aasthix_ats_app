import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MentionRow = { id: number; full_name: string; email: string | null };

export async function GET(request: Request) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 8, 1), 25);
    if (q.length < 1) {
      return NextResponse.json({ users: [], candidates: [] });
    }

    const usersRes = await query(
      `SELECT id, full_name, email
       FROM users
       WHERE is_active = TRUE
         AND (full_name ILIKE $1 OR email ILIKE $1)
       ORDER BY full_name
       LIMIT $2`,
      [`%${q}%`, limit]
    );

    const candidatesRes = await query(
      `SELECT id, full_name, email
       FROM candidates
       WHERE (full_name ILIKE $1 OR COALESCE(email, '') ILIKE $1)
       ORDER BY full_name
       LIMIT $2`,
      [`%${q}%`, limit]
    );

    return NextResponse.json({
      users: (usersRes.rows as MentionRow[]).map((row) => ({
        type: "user",
        id: Number(row.id),
        label: String(row.full_name),
        sublabel: String(row.email || ""),
      })),
      candidates: (candidatesRes.rows as MentionRow[]).map((row) => ({
        type: "candidate",
        id: Number(row.id),
        label: String(row.full_name),
        sublabel: String(row.email || ""),
      })),
    });
  } catch (error) {
    console.error("chat/mentions GET", error);
    return NextResponse.json({ error: "Failed to load mention suggestions" }, { status: 500 });
  }
}
