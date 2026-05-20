import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FeedEvent = {
  event: string;
  payload: unknown;
};

function sseEvent(event: FeedEvent) {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.payload)}\n\n`;
}

export async function GET(request: Request) {
  const gate = await requirePermission("chat.view");
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const access = gate.access;

  const { searchParams } = new URL(request.url);
  const conversationIdParam = searchParams.get("conversation_id");
  const conversationId = conversationIdParam ? Number(conversationIdParam) : null;
  if (conversationIdParam && !Number.isFinite(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation_id" }, { status: 400 });
  }

  let active = true;
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastCursor = 0;
      let lastCallCursor = 0;
      controller.enqueue(
        encoder.encode(
          sseEvent({
            event: "ready",
            payload: { user_id: access.user_id, mode: "sse-realtime", fallback: "polling" },
          })
        )
      );

      const heartbeat = setInterval(() => {
        if (!active) return;
        controller.enqueue(encoder.encode(`event: heartbeat\ndata: {"ts":"${new Date().toISOString()}"}\n\n`));
      }, 15_000);

      while (active) {
        try {
          const params: Array<number> = [access.user_id, lastCursor];
          let convoFilter = "";
          if (conversationId) {
            params.push(conversationId);
            convoFilter = ` AND m.conversation_id = $${params.length}`;
          }

          const res = await query(
            `SELECT
               m.id,
               m.conversation_id,
               m.sender_id,
               m.content,
               m.created_at,
               m.parent_message_id,
               m.edited_at,
               m.deleted_at
             FROM messages m
             JOIN conversation_members cm
               ON cm.conversation_id = m.conversation_id
              AND cm.user_id = $1
             WHERE m.id > $2
               ${convoFilter}
             ORDER BY m.id ASC
             LIMIT 100`,
            params
          );

          for (const row of res.rows as Array<Record<string, unknown>>) {
            const id = Number(row.id || 0);
            if (id > lastCursor) lastCursor = id;
            const eventName =
              row.deleted_at != null
                ? "message.deleted"
                : row.edited_at != null
                  ? "message.updated"
                  : row.parent_message_id != null
                    ? "thread.reply"
                    : "message.created";
            controller.enqueue(encoder.encode(sseEvent({ event: eventName, payload: row })));
          }

          const callParams: Array<number> = [access.user_id, lastCallCursor];
          let callConvoFilter = "";
          if (conversationId) {
            callParams.push(conversationId);
            callConvoFilter = ` AND r.conversation_id = $${callParams.length}`;
          }
          const callRes = await query(
            `SELECT
               e.id,
               e.room_id,
               e.user_id,
               e.event_type,
               e.metadata,
               e.created_at,
               r.conversation_id
             FROM chat_call_events e
             JOIN chat_call_rooms r
               ON r.id = e.room_id
             JOIN conversation_members cm
               ON cm.conversation_id = r.conversation_id
              AND cm.user_id = $1
             WHERE e.id > $2
               ${callConvoFilter}
             ORDER BY e.id ASC
             LIMIT 100`,
            callParams
          );

          for (const row of callRes.rows as Array<Record<string, unknown>>) {
            const id = Number(row.id || 0);
            if (id > lastCallCursor) lastCallCursor = id;
            const rawType = String(row.event_type || "update")
              .toLowerCase()
              .replace(/[^a-z0-9_]+/g, "_");
            controller.enqueue(
              encoder.encode(
                sseEvent({
                  event: `call.${rawType}`,
                  payload: row,
                })
              )
            );
            controller.enqueue(encoder.encode(sseEvent({ event: "call.state", payload: row })));
          }
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              sseEvent({
                event: "error",
                payload: { message: error instanceof Error ? error.message : "Realtime stream error" },
              })
            )
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }

      clearInterval(heartbeat);
      controller.close();
    },
    cancel() {
      active = false;
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
