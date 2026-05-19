import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusKind = "presenting" | "in_call" | "in_meeting" | "busy" | "active_now" | "none";

export async function GET() {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const convs = await query(
      `
      SELECT c.id
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id = c.id
      WHERE cm.user_id = $1
      `,
      [access.user_id],
    );
    const ids = convs.rows.map((r: any) => Number(r.id)).filter((id: number) => Number.isFinite(id));
    if (!ids.length) return NextResponse.json({ statuses: [] });

    const nowWindow = await query(
      `
      SELECT
        conversation_id,
        mode,
        status,
        start_at,
        end_at
      FROM chat_call_rooms
      WHERE status IN ('scheduled', 'active')
        AND start_at <= NOW() + INTERVAL '15 minutes'
        AND end_at >= NOW() - INTERVAL '5 minutes'
      `,
      [],
    );

    const latestMsgs = await query(
      `
      SELECT conversation_id, MAX(created_at) AS last_at
      FROM messages
      WHERE conversation_id = ANY($1::bigint[])
      GROUP BY conversation_id
      `,
      [ids],
    );

    const pref = await query(`SELECT manual_presence FROM chat_user_preferences WHERE user_id = $1 LIMIT 1`, [access.user_id]);
    const manualBusy = String((pref.rows[0] as { manual_presence?: string } | undefined)?.manual_presence || "available") === "busy";

    const msgMap = new Map<number, number>();
    for (const row of latestMsgs.rows as Array<{ conversation_id: number; last_at: string }>) {
      msgMap.set(Number(row.conversation_id), new Date(row.last_at).getTime());
    }

    const evMap = new Map<number, { presenting: boolean; inCall: boolean; inMeeting: boolean }>();
    for (const row of nowWindow.rows as Array<{ conversation_id: number | null; mode: string; status: string }>) {
      const cid = Number(row.conversation_id || 0);
      if (!cid || !ids.includes(cid)) continue;
      const slot = evMap.get(cid) || { presenting: false, inCall: false, inMeeting: false };
      if (row.status === "active") {
        if (String(row.mode || "").toLowerCase() === "screenshare") slot.presenting = true;
        else slot.inCall = true;
      } else {
        slot.inMeeting = true;
      }
      evMap.set(cid, slot);
    }

    const statuses = ids.map((conversationId: number) => {
      const ev = evMap.get(conversationId);
      let kind: StatusKind = "none";
      if (ev?.presenting) kind = "presenting";
      else if (ev?.inCall) kind = "in_call";
      else if (ev?.inMeeting) kind = "in_meeting";
      else if (manualBusy) kind = "busy";
      else {
        const lastAt = msgMap.get(conversationId) || 0;
        if (Date.now() - lastAt <= 5 * 60_000) kind = "active_now";
      }
      return {
        conversation_id: conversationId,
        status_kind: kind,
      };
    });

    return NextResponse.json({ statuses });
  } catch (error) {
    console.error("chat/conversations/statuses GET", error);
    return NextResponse.json({ error: "Failed to load conversation statuses." }, { status: 500 });
  }
}
