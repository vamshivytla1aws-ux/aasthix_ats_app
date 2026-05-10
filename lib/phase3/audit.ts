import { query } from "@/lib/db";

export async function recordPhase3AuditEvent(input: {
  actorUserId: number | null;
  action: string;
  metadata: Record<string, unknown>;
}) {
  try {
    await query(
      `INSERT INTO app_audit_events (actor_user_id, action, metadata)
       VALUES ($1, $2, $3::jsonb)`,
      [input.actorUserId, input.action, JSON.stringify(input.metadata ?? {})]
    );
  } catch (error) {
    console.error("recordPhase3AuditEvent", error);
  }
}
