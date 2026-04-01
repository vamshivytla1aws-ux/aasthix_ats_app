import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAuthUser } from "@/lib/authServer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { candidate_id, note } = body as { candidate_id?: number; note?: string };

    const candidateId = Number(candidate_id);
    if (!Number.isFinite(candidateId)) {
      return NextResponse.json({ error: "candidate_id is required" }, { status: 400 });
    }

    const noteText = typeof note === "string" ? note.trim() : "";
    if (!noteText) {
      return NextResponse.json({ error: "note is required" }, { status: 400 });
    }

    const owned = await query(
      `
      SELECT id
      FROM candidates
      WHERE id = $1
        AND created_by_user_id = $2
      `,
      [candidateId, user.user_id]
    );

    if (owned.rowCount === 0) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const inserted = await query(
      `
      INSERT INTO candidate_notes (candidate_id, note)
      VALUES ($1, $2)
      RETURNING id, candidate_id, note, created_at
      `,
      [candidateId, noteText]
    );

    return NextResponse.json(inserted.rows[0], { status: 201 });
  } catch (error) {
    console.error("Error creating candidate note", error);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}

