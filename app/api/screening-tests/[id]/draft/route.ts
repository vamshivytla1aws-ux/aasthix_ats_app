import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Autosave draft (same device_id + token). Does not count as submission. */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const testId = Number(params.id);
    if (!Number.isFinite(testId)) return NextResponse.json({ error: "Invalid test id" }, { status: 400 });

    const body = await request.json();
    const token = String(body?.token || "").trim();
    const deviceId = String(body?.device_id || "").trim();
    const answers = body?.answers && typeof body.answers === "object" ? body.answers : {};

    if (!token) return NextResponse.json({ error: "Token is required" }, { status: 400 });
    if (!deviceId || deviceId.length < 8) {
      return NextResponse.json({ error: "device_id is required (generate a UUID on first visit)" }, { status: 400 });
    }

    const testRes = await query(
      `
      SELECT st.id, st.application_id, st.candidate_id, st.status, st.expires_at
      FROM screening_tests st
      WHERE st.id = $1 AND st.access_token = $2
      LIMIT 1
      `,
      [testId, token]
    );
    if (testRes.rowCount === 0) return NextResponse.json({ error: "Test not found" }, { status: 404 });

    const row = testRes.rows[0] as any;
    if (row.status !== "pending") {
      return NextResponse.json({ error: "Draft save is only allowed before submit." }, { status: 409 });
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await query(`UPDATE screening_tests SET status = 'expired', updated_at = NOW() WHERE id = $1`, [testId]);
      return NextResponse.json({ error: "Test expired" }, { status: 410 });
    }

    const sanitized: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
      if (!/^\d+$/.test(k)) continue;
      sanitized[k] = String(v ?? "").slice(0, 20000);
    }

    await query(
      `
      INSERT INTO screening_test_drafts (test_id, device_id, answers_json, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (test_id, device_id)
      DO UPDATE SET answers_json = EXCLUDED.answers_json, updated_at = NOW()
      `,
      [testId, deviceId, JSON.stringify(sanitized)]
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error?.code === "42P01") {
      return NextResponse.json({ error: "Run migration 0036 for draft support" }, { status: 503 });
    }
    console.error("Error saving screening draft", error);
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }
}
