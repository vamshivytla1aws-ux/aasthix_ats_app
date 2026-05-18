import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const userPrefRes = await query(
      `SELECT
         mention_only,
         desktop_sound,
         desktop_toast,
         email_digest,
         email_digest_frequency
       FROM chat_user_preferences
       WHERE user_id = $1
       LIMIT 1`,
      [access.user_id]
    );

    const convoPrefRes = await query(
      `SELECT conversation_id, muted, mention_only, updated_at
       FROM chat_conversation_preferences
       WHERE user_id = $1`,
      [access.user_id]
    );

    return NextResponse.json({
      user: userPrefRes.rows[0] ?? {
        mention_only: false,
        desktop_sound: true,
        desktop_toast: true,
        email_digest: false,
        email_digest_frequency: "daily",
      },
      conversations: convoPrefRes.rows,
    });
  } catch (error) {
    console.error("chat/preferences GET", error);
    return NextResponse.json({ error: "Failed to load preferences" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;
    const body = await request.json();

    const user = body?.user ?? {};
    const conversations = Array.isArray(body?.conversations) ? body.conversations : [];

    await query(
      `INSERT INTO chat_user_preferences (
         user_id,
         mention_only,
         desktop_sound,
         desktop_toast,
         email_digest,
         email_digest_frequency,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         mention_only = EXCLUDED.mention_only,
         desktop_sound = EXCLUDED.desktop_sound,
         desktop_toast = EXCLUDED.desktop_toast,
         email_digest = EXCLUDED.email_digest,
         email_digest_frequency = EXCLUDED.email_digest_frequency,
         updated_at = NOW()`,
      [
        access.user_id,
        Boolean(user.mention_only),
        user.desktop_sound !== false,
        user.desktop_toast !== false,
        Boolean(user.email_digest),
        ["off", "daily", "weekly"].includes(String(user.email_digest_frequency))
          ? String(user.email_digest_frequency)
          : "daily",
      ]
    );

    for (const pref of conversations) {
      const conversationId = Number(pref?.conversation_id);
      if (!Number.isFinite(conversationId)) continue;
      await query(
        `INSERT INTO chat_conversation_preferences (
           conversation_id,
           user_id,
           muted,
           mention_only,
           updated_at
         )
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (conversation_id, user_id)
         DO UPDATE SET
           muted = EXCLUDED.muted,
           mention_only = EXCLUDED.mention_only,
           updated_at = NOW()`,
        [conversationId, access.user_id, Boolean(pref?.muted), Boolean(pref?.mention_only)]
      );
    }

    return NextResponse.json({
      operation_status: "success",
      user_message: "Chat preferences updated.",
    });
  } catch (error) {
    console.error("chat/preferences PUT", error);
    return NextResponse.json({ error: "Failed to update preferences" }, { status: 500 });
  }
}

