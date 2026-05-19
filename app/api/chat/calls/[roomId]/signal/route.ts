import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignalType = "offer" | "answer" | "ice" | "leave" | "presenting";

function normalizeSignalType(value: unknown): SignalType {
  const v = String(value || "").toLowerCase();
  if (v === "offer" || v === "answer" || v === "ice" || v === "leave" || v === "presenting") return v;
  return "ice";
}

export async function GET(request: Request, { params }: { params: { roomId: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const roomId = Number(params.roomId);
    if (!Number.isFinite(roomId)) return NextResponse.json({ error: "Invalid room id." }, { status: 400 });

    const url = new URL(request.url);
    const afterId = Number(url.searchParams.get("after_id") || "0");
    const signalsRes = await query(
      `
      SELECT id, room_id, from_user_id, to_user_id, signal_type, payload, created_at
      FROM chat_call_signals
      WHERE room_id = $1
        AND id > $2
        AND (to_user_id IS NULL OR to_user_id = $3)
        AND from_user_id <> $3
      ORDER BY id ASC
      LIMIT 100
      `,
      [roomId, Number.isFinite(afterId) ? afterId : 0, access.user_id],
    );
    return NextResponse.json({ signals: signalsRes.rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch signals." }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: { roomId: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const roomId = Number(params.roomId);
    if (!Number.isFinite(roomId)) return NextResponse.json({ error: "Invalid room id." }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const signalType = normalizeSignalType(body?.signal_type);
    const toUserIdRaw = Number(body?.to_user_id);
    const toUserId = Number.isFinite(toUserIdRaw) ? toUserIdRaw : null;
    const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};

    const ins = await query(
      `
      INSERT INTO chat_call_signals (room_id, from_user_id, to_user_id, signal_type, payload)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id
      `,
      [roomId, access.user_id, toUserId, signalType, JSON.stringify(payload)],
    );
    return NextResponse.json({ operation_status: "success", id: Number(ins.rows[0]?.id || 0) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to publish signal." }, { status: 400 });
  }
}

