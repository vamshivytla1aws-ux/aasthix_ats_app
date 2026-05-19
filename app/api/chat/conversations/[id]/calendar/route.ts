import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { ATS_TIMEZONE } from "@/lib/timezones";
import { createTeamCalendarEvent } from "@/lib/teamCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertConversationMember(conversationId: number, userId: number) {
  const memberCheck = await query(
    `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
  return memberCheck.rowCount > 0;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const conversationId = Number(params.id);
    if (!Number.isFinite(conversationId)) {
      return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
    }
    if (!(await assertConversationMember(conversationId, access.user_id))) {
      return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });
    }

    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 100) : 25;
    const marker = `%[chat-conversation:${conversationId}]%`;

    const rows = await query(
      `
      SELECT id, title, start_at, end_at, meet_link, status, calendar_sync_status
      FROM team_calendar_events
      WHERE COALESCE(description, '') ILIKE $1
        AND status <> 'cancelled'
      ORDER BY start_at ASC
      LIMIT $2
      `,
      [marker, limit],
    );

    const events = (rows.rows as Array<any>).map((event) => {
      const start = new Date(event.start_at).getTime() - 5 * 60_000;
      const end = new Date(event.end_at).getTime();
      const isActive = Date.now() >= start && Date.now() <= end;
      return {
        ...event,
        session_mode: String(event.title || "").toLowerCase().includes("screen share") ? "screenshare" : "call",
        is_active: isActive,
        status_kind: isActive ? "in_meeting" : "none",
        status_priority: isActive ? 3 : 999,
      };
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("chat/conversations/[id]/calendar GET", error);
    return NextResponse.json({ error: "Failed to load chat calendar events." }, { status: 500 });
  }
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
    if (!(await assertConversationMember(conversationId, access.user_id))) {
      return NextResponse.json({ error: "Not a member of this conversation." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const title = String(body?.title || "").trim() || "Scheduled chat call";
    const startAt = new Date(String(body?.start_at || ""));
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: "start_at must be a valid datetime." }, { status: 400 });
    }
    const durationRaw = Number(body?.duration_minutes);
    const durationMinutes = Number.isFinite(durationRaw) && durationRaw >= 10 && durationRaw <= 240 ? Math.trunc(durationRaw) : 30;
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

    const memberRes = await query(
      `
      SELECT u.email
      FROM conversation_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.conversation_id = $1 AND u.email IS NOT NULL
      `,
      [conversationId],
    );
    const attendeeEmails: string[] = Array.from(
      new Set(
        memberRes.rows
          .map((row: { email?: string }) => String(row.email || "").trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    if (!attendeeEmails.length) {
      return NextResponse.json({ error: "No attendee emails found in this conversation." }, { status: 400 });
    }

    const event = await createTeamCalendarEvent(access.user_id, {
      title,
      description: `[chat-conversation:${conversationId}] Scheduled from chat calendar.`,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      timezone: ATS_TIMEZONE,
      attendee_emails: attendeeEmails,
    });

    if (event.meet_link) {
      await query(
        `INSERT INTO messages (conversation_id, sender_id, content, is_system) VALUES ($1, $2, $3, TRUE)`,
        [conversationId, access.user_id, `New scheduled call: ${title}. Join: ${event.meet_link}`],
      );
      await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
    }

    return NextResponse.json({
      operation_status: "success",
      user_message: "Call scheduled from chat calendar.",
      event,
    });
  } catch (error) {
    return NextResponse.json(
      {
        operation_status: "error",
        error: error instanceof Error ? error.message : "Failed to create chat calendar event.",
      },
      { status: 400 },
    );
  }
}
