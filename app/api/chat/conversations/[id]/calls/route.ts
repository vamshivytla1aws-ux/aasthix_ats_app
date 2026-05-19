import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { ATS_TIMEZONE } from "@/lib/timezones";
import { createTeamCalendarEvent } from "@/lib/teamCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CallMode = "call" | "screenshare";

function normalizeMode(value: unknown): CallMode {
  const mode = String(value || "").trim().toLowerCase();
  return mode === "screenshare" ? "screenshare" : "call";
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
    }

    const memberCheck = await query(
      `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, access.user_id],
    );
    if (!memberCheck.rowCount) {
      return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });
    }

    const convRes = await query(
      `
      SELECT c.id, c.name, c.type, COALESCE(array_agg(u.email) FILTER (WHERE u.email IS NOT NULL), '{}') AS member_emails
      FROM conversations c
      JOIN conversation_members cm ON cm.conversation_id = c.id
      JOIN users u ON u.id = cm.user_id
      WHERE c.id = $1
      GROUP BY c.id
      `,
      [conversationId],
    );
    const conv = convRes.rows[0] as { name: string | null; type: "direct" | "group"; member_emails: string[] } | undefined;
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const mode = normalizeMode(body?.mode);
    const durationMinutesRaw = Number(body?.duration_minutes);
    const durationMinutes = Number.isFinite(durationMinutesRaw) && durationMinutesRaw >= 10 && durationMinutesRaw <= 180 ? Math.trunc(durationMinutesRaw) : 30;
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    const modeLabel = mode === "screenshare" ? "Screen Share" : "Call";
    const title = `${modeLabel} • ${conv.name || "Chat conversation"}`;
    const description = `[chat-conversation:${conversationId}] mode=${mode}; Instant ${modeLabel.toLowerCase()} started from chat.`;

    const event = await createTeamCalendarEvent(access.user_id, {
      title,
      description,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      timezone: ATS_TIMEZONE,
      attendee_emails: conv.member_emails,
    });

    const meetLink = event.meet_link || "";
    if (meetLink) {
      const systemMessage =
        mode === "screenshare"
          ? `Screen share session started. Join: ${meetLink}`
          : `Call started. Join: ${meetLink}`;
      await query(
        `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
        [conversationId, access.user_id, systemMessage],
      );
      await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
    }

    return NextResponse.json({
      operation_status: "success",
      user_message: `${modeLabel} created successfully.`,
      event,
      join_link: meetLink || null,
      session_mode: mode,
      is_active: true,
      status_kind: mode === "screenshare" ? "presenting" : "in_call",
      status_priority: mode === "screenshare" ? 1 : 2,
    });
  } catch (error) {
    return NextResponse.json(
      {
        operation_status: "error",
        error: error instanceof Error ? error.message : "Failed to start call.",
      },
      { status: 400 },
    );
  }
}
